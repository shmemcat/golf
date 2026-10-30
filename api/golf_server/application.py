"""Golf's own HTTP API and Socket.IO transport. No Hearts/Euchre game imports."""
import copy
import json
import os
import re
import secrets
import time
from collections import defaultdict, deque
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO
from sqlalchemy.engine import make_url
from .account_contracts import AccountsUnavailable
from .account_remote import RemoteAccounts
from .extensions import db
from .models import AchievementUnlock, DeletedUser, Result, Room
from .runtime import GolfRuntime, Rejected, NAMESPACE, SOCKET_PATH
from .schema import schema_ready
from .statistics import account_statistics, leaderboard

TIMINGS = {"deal": .9, "flip": .56, "flight": .6, "opponents": .75,
           "bot_draw": 1., "bot_replace": .8}


def create_app(config=None, *, accounts=None):
    app = Flask("golf_server")
    app.config.from_mapping(
        SQLALCHEMY_DATABASE_URI=os.environ.get("GOLF_DATABASE_URL", os.environ.get("DATABASE_URL", "")),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SECRET_KEY=os.environ.get("GOLF_SECRET_KEY", ""), SESSION_COOKIE_NAME="golf_session",
        SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=False,
        CARDS_PUBLIC_URL=os.environ.get("CARDS_PUBLIC_URL", "http://localhost:3000"),
        CARDS_ACCOUNTS_URL=os.environ.get("CARDS_ACCOUNTS_URL", "http://127.0.0.1:5100"),
        CARDS_SERVICE_ID="golf-game", CARDS_SERVICE_TOKEN=os.environ.get("CARDS_SERVICE_TOKEN", ""),
        GAME_ACCOUNT_TOKENS=json.loads(os.environ.get("CARDS_GAME_ACCOUNT_TOKENS", "{}")),
        CORS_ORIGINS=os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:3003,http://127.0.0.1:3003"),
        GOLF_TIMINGS=TIMINGS.copy(), START_GOLF_WORKER=True, MAX_CONTENT_LENGTH=16384,
    )
    app.config.update(config or {})
    if not app.config["SQLALCHEMY_DATABASE_URI"] or len(app.config["SECRET_KEY"] or "") < 32:
        raise ValueError("Golf requires its own database URL and a strong GOLF_SECRET_KEY.")
    uri = make_url(app.config["SQLALCHEMY_DATABASE_URI"])
    if uri.drivername == "postgresql":
        uri = uri.set(drivername="postgresql+psycopg2")
    app.config["SQLALCHEMY_DATABASE_URI"] = uri
    app.config["CARDS_COOKIE_SECURE"] = app.config["CARDS_PUBLIC_URL"].startswith("https://")
    app.config["SESSION_COOKIE_SECURE"] = app.config["CARDS_COOKIE_SECURE"]
    origins = app.config["CORS_ORIGINS"]
    if isinstance(origins, str):
        origins = [o.strip() for o in origins.split(",") if o.strip()]
    app.config["GOLF_ORIGINS"] = set(origins)
    provider = accounts or RemoteAccounts(app.config["CARDS_ACCOUNTS_URL"], "golf-game", app.config["CARDS_SERVICE_TOKEN"])
    app.extensions["accounts"] = provider
    db.init_app(app)
    CORS(app, origins=origins, supports_credentials=True)
    Limiter(key_func=get_remote_address, app=app, default_limits=["300 per minute"], storage_uri="memory://", enabled=not app.testing)
    socketio = SocketIO(app, path=SOCKET_PATH, cors_allowed_origins=origins, async_mode="threading",
                        manage_session=False, max_http_buffer_size=16384, logger=False, engineio_logger=False)
    runtime = GolfRuntime(app, socketio)
    app.extensions["golf_runtime"] = runtime
    app.extensions["socketio"] = socketio
    socket_limits = defaultdict(deque)

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise Rejected("Submit a JSON object.")
        return value

    def actor():
        provider.refresh()
        user = provider.cookie_user()
        if user and db.session.get(DeletedUser, user.id):
            raise Rejected("This account is no longer available.", "SIGNED_OUT")
        if user:
            who = {"key": f"account:{user.id}", "user": user}
            if session.get("guest") and not session.get("guest_lobbies_claimed"):
                runtime.transfer_guest_lobbies(who, "guest:" + session["guest"])
                session["guest_lobbies_claimed"] = True
            return who
        if session.get("guest_lobbies_claimed"):
            session.pop("guest_lobbies_claimed")
        if not session.get("guest"):
            session["guest"] = secrets.token_urlsafe(32)
        return {"key": "guest:" + session["guest"], "user": None}

    def guard(token=None):
        origin = request.headers.get("Origin")
        # A same-origin polling GET can omit Origin. Socket authentication still
        # requires the unguessable Golf CSRF token bound to the signed cookie.
        # Browsers include Origin on cross-origin requests; those must match.
        if origin not in app.config["GOLF_ORIGINS"] and not (token is not None and origin is None):
            raise Rejected("This request did not come from the Golf site.", "ORIGIN_INVALID")
        supplied = token if token is not None else request.headers.get("X-Golf-CSRF", "")
        expected = session.get("golf_csrf", "")
        if not expected or not isinstance(supplied, str) or len(supplied) > 128 or not secrets.compare_digest(expected, supplied):
            raise Rejected("Refresh Golf and try again.", "CSRF_INVALID")

    def require_user():
        identity = actor()["user"]
        if not identity:
            raise Rejected("Sign in to see your account statistics.", "SIGNED_OUT")
        return identity

    @app.errorhandler(Rejected)
    @app.errorhandler(ValueError)
    def invalid(error):
        code = getattr(error, "code", "INVALID_REQUEST")
        status = 401 if code == "SIGNED_OUT" else 404 if code == "NOT_FOUND" else 403 if code in ("NOT_SEATED", "CSRF_INVALID", "ORIGIN_INVALID") else 409 if code == "STALE_STATE" else 400
        return jsonify(error=str(error), code=code), status

    @app.errorhandler(AccountsUnavailable)
    def unavailable(error):
        return jsonify(error="Accounts are temporarily unavailable. Please retry.", code="ACCOUNTS_UNAVAILABLE"), 503

    @app.after_request
    def private_response(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health")
    def health():
        return jsonify(status="ok", component="golf-game", socket_path="/golf/socket.io", namespace=NAMESPACE,
                       version=os.environ.get("GOLF_SERVER_VERSION", "development"),
                       revision=os.environ.get("GOLF_SOURCE_REVISION", "unknown"))

    @app.get("/ready")
    def ready():
        good = schema_ready()
        return jsonify(status="ready" if good else "not-ready", component="golf-game"), 200 if good else 503

    @app.get("/api/golf/session")
    def game_session():
        identity = actor()["user"]
        if not session.get("golf_csrf"):
            session["golf_csrf"] = secrets.token_urlsafe(32)
        return jsonify(csrf_token=session["golf_csrf"], user={"id": str(identity.id), "name": identity.username, "profile_icon": identity.profile_icon} if identity else None)

    @app.post("/api/golf/bots")
    def bots():
        guard()
        value, who = body(), actor()
        return jsonify(state=runtime.create(who, value.get("players"), "bot", value.get("requestId"), value.get("name")))

    @app.get("/api/golf/active")
    def active_games():
        return jsonify(rooms=runtime.active_rooms(actor()))

    @app.post("/api/golf/lobbies")
    def create_lobby():
        guard()
        value, who = body(), actor()
        return jsonify(state=runtime.create(who, value.get("players"), "multiplayer", value.get("requestId"), value.get("name")))

    @app.post("/api/golf/lobbies/join")
    def join_lobby():
        guard()
        value, who = body(), actor()
        code = value.get("code")
        if not isinstance(code, str) or not re.fullmatch(r"[A-Za-z2-9]{6}", code):
            raise Rejected("Enter the six-character lobby code.")
        return jsonify(state=runtime.join(who, code, value.get("name")))

    @app.get("/api/golf/rooms/<code>")
    def get_room(code):
        who = actor()
        return jsonify(state=runtime.state(who, code))

    @app.post("/api/golf/rooms/<code>/actions")
    def action(code):
        guard()
        value, who = body(), actor()
        return jsonify(state=runtime.command(who, code, value))

    @app.get("/api/golf/stats")
    def stats():
        identity = require_user()
        with runtime.lock:
            return jsonify(statistics=account_statistics(identity.id))

    @app.post("/api/golf/achievements")
    def unlock_achievement():
        guard()
        identity = require_user()
        if body().get("id") != "geezer":
            raise Rejected("This achievement is earned by playing Golf.")
        with runtime.lock:
            key = (identity.id, "geezer")
            if not db.session.get(AchievementUnlock, key):
                db.session.add(AchievementUnlock(user_id=identity.id, achievement_id="geezer"))
                db.session.commit()
        return jsonify(unlocks=["geezer"])

    @app.get("/api/golf/results")
    def results():
        identity = require_user()
        try:
            offset = max(0, int(request.args.get("offset", "0")))
        except ValueError:
            raise Rejected("Invalid results page.")
        rows = Result.query.filter(Result.user_id == identity.id, Result.status.in_(("completed", "abandoned"))).order_by(Result.completed_at.desc()).offset(offset).limit(25).all()
        return jsonify(results=[{"id": r.game_id, "mode": r.mode, "status": r.status, "won": r.won, "score": r.score,
                                "finishedAt": r.completed_at.isoformat() + "Z", **r.detail} for r in rows], next_offset=offset + 25 if len(rows) == 25 else None)

    @app.get("/api/golf/leaderboard")
    def leaders():
        mode = request.args.get("mode", "bot")
        if mode not in ("bot", "multiplayer", "achievements"):
            raise Rejected("Choose Bot, Multiplayer, or Achievements.")
        # Remote profile lookup is never made while a Golf mutation gate is held.
        return jsonify(leaderboard(mode, provider))

    @app.post("/_internal/games/v1/golf/delete-user")
    def delete_user():
        expected = app.config["GAME_ACCOUNT_TOKENS"].get("golf", "")
        supplied = request.headers.get("Authorization", "")
        if len(expected) < 32 or request.headers.get("X-Cards-Service") != "accounts" or not secrets.compare_digest(supplied, "Bearer " + expected):
            return jsonify(error="Unauthorized"), 401
        value = body()
        uid, rid = value.get("user_id"), value.get("request_id")
        if type(uid) is not int or uid <= 0 or not isinstance(rid, str) or not 1 <= len(rid) <= 64:
            raise Rejected("Invalid deletion request.")
        with runtime.lock:
            if not db.session.get(DeletedUser, uid):
                db.session.add(DeletedUser(user_id=uid, request_id=rid))
            Result.query.filter_by(user_id=uid).delete()
            AchievementUnlock.query.filter_by(user_id=uid).delete()
            for row in Room.query.all():
                data = copy.deepcopy(row.data)
                runtime.record_completed_holes(data)
                changed = False
                old_key = f"account:{uid}"
                for person in data["seats"]:
                    if person.get("userId") == uid:
                        person.update(userId=None, name="Deleted player", profileIcon="user", cardBack="argyle", left=True, actor="deleted:" + secrets.token_hex(8))
                        changed = True
                for record in data.get("holeRecords", []):
                    for player in record["players"]:
                        if player["actor"] == old_key:
                            player.update(actor="deleted:" + secrets.token_hex(8), name="Deleted player", icon="user")
                            changed = True
                if changed:
                    data["receipts"].pop(old_key, None)
                    if data["host"] == old_key:
                        data["host"] = next((p["actor"] for p in data["seats"] if not p.get("left") and not p["isBot"]), "deleted")
                    if data.get("createRequest", [None])[0] == old_key:
                        data["createRequest"] = ["deleted", "deleted"]
                    runtime.save(row, data, "account_deleted")
            db.session.commit()
        return jsonify(version=1, deleted=True, request_id=rid)

    def socket_actor():
        # Flask-SocketIO reuses the handshake environ: never cache account checks
        # across messages, or logout/deletion would leave an old socket usable.
        provider.refresh()
        return actor()

    def socket_guard():
        queue = socket_limits[request.sid]
        now = time.monotonic()
        while queue and queue[0] < now - 10:
            queue.popleft()
        if len(queue) >= 100:
            raise Rejected("Please slow down and try again.", "RATE_LIMITED")
        queue.append(now)

    @socketio.on("connect", namespace=NAMESPACE)
    def connect(auth):
        try:
            guard(auth.get("csrf_token") if isinstance(auth, dict) else "")
            socket_actor()
            return True
        except (Rejected, AccountsUnavailable):
            return False

    @socketio.on("golf:subscribe", namespace=NAMESPACE)
    def subscribe(value):
        try:
            socket_guard()
            if not isinstance(value, dict):
                raise Rejected("Invalid subscription.")
            who = socket_actor()
            return {"ok": True, "state": runtime.subscribe(request.sid, who, value.get("code", ""))}
        except (Rejected, AccountsUnavailable) as error:
            return {"ok": False, "error": str(error), "code": getattr(error, "code", "ACCOUNTS_UNAVAILABLE")}

    @socketio.on("golf:action", namespace=NAMESPACE)
    def socket_action(value):
        try:
            socket_guard()
            who = socket_actor()
            if not isinstance(value, dict):
                raise Rejected("Invalid move.")
            state = runtime.command(who, value.get("code", ""), value)
            return {"ok": True, "state": state}
        except (Rejected, AccountsUnavailable, ValueError) as error:
            return {"ok": False, "error": str(error), "code": getattr(error, "code", "ACCOUNTS_UNAVAILABLE" if isinstance(error, AccountsUnavailable) else "INVALID_MOVE")}

    @socketio.on("disconnect", namespace=NAMESPACE)
    def disconnect():
        socket_limits.pop(request.sid, None)
        runtime.disconnect(request.sid)

    if app.config["START_GOLF_WORKER"]:
        runtime.start()
    return app
