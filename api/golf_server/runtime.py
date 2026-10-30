"""One Golf runtime owns its independent socket, durable rooms, and move clock."""
import copy
import hashlib
import json
import secrets
import threading
import time
from datetime import datetime
from flask import request
from . import engine
from .account_contracts import AccountsUnavailable
from .extensions import db
from .models import Room, Event, DeletedUser
from .statistics import save_results, count_hole

BOT_NAMES = ("Clover", "Birdie", "Sunny", "Maple", "Robin")
NAMESPACE = "/golf"
SOCKET_PATH = "golf/socket.io"
IDLE_WARNING_SECONDS = 540
IDLE_TIMEOUT_SECONDS = 600
ACTIONS = ("start", "close", "leave", "reveal", "advance", "restart", "draw", "replace", "toss")


class Rejected(ValueError):
    def __init__(self, message, code="INVALID_MOVE"):
        super().__init__(message)
        self.code = code


class GolfRuntime:
    def __init__(self, app, socketio):
        self.app, self.socketio = app, socketio
        self.lock = threading.RLock()
        self.connections = {}  # sid -> (room code, actor key)
        self.worker = None
        self.recovered = False

    def delay(self, name):
        return self.app.config["GOLF_TIMINGS"][name]

    def schedule(self, data, kind, delay, **extra):
        data["next"] = {"kind": kind, "at": time.time() + delay, **extra}

    def person(self, actor, name=None):
        user = actor["user"]
        if name is not None and (not isinstance(name, str) or len(name) > 24):
            raise Rejected("Use a name of up to 24 characters.")
        try:
            utc_offset = int(request.headers.get("X-Golf-UTC-Offset", "0"))
        except ValueError:
            raise Rejected("Use a valid local time offset.")
        if not -840 <= utc_offset <= 720:
            raise Rejected("Use a valid local time offset.")
        return {"actor": actor["key"], "userId": user.id if user else None,
                "name": user.username if user else (name or "Guest").strip() or "Guest",
                "utcOffsetMinutes": utc_offset,
                "profileIcon": user.profile_icon if user else "user", "cardBack": user.golf_card_back if user else "argyle", "isBot": False, "left": False}

    def refresh_appearance(self, data, actor):
        person = data["seats"][self.seat(data, actor["key"])]
        card_back = actor["user"].golf_card_back if actor["user"] else "argyle"
        changed = person.get("cardBack", "argyle") != card_back
        person["cardBack"] = card_back
        return changed

    def state(self, actor, code):
        with self.lock:
            row = self.get(code)
            data = copy.deepcopy(row.data)
            if self.refresh_appearance(data, actor):
                self.save(row, data, "appearance")
            return self.view(data, actor["key"])

    def get(self, code):
        row = db.session.get(Room, str(code).upper())
        if not row:
            raise Rejected("This lobby was not found.", "NOT_FOUND")
        return row

    def seat(self, data, actor):
        for i, person in enumerate(data["seats"]):
            if person["actor"] == actor and not person.get("left"):
                return i
        raise Rejected("You are not seated at this table.", "NOT_SEATED")

    def reviewing_hole(self, data, seat):
        return bool(data.get("previousHole")) and seat not in data["ready"]

    def action_token(self, data, seat, action):
        """Bind a command to its decision, independent of other players' updates."""
        game = data.get("game")
        context = [data["code"], data["seats"][seat]["actor"], action]
        if action == "leave":
            pass  # Leaving remains valid while the game continues.
        elif action in ("start", "close"):
            context += [data["host"], data.get("closed", False), game["id"] if game else None]
        else:
            # A late Next Hole click still refers to this player's completed
            # board, even when other players are already opening the next one.
            visible = data["previousHole"] if action == "advance" and self.reviewing_hole(data, seat) else game
            context += [visible["id"], visible["hole"], visible["phase"]] if visible else [None]
            if game and action == "reveal":
                context += [data["stage"], self.reviewing_hole(data, seat),
                            [[c["card"]["id"], c["faceUp"]] for c in game["players"][seat]["cards"]]]
            elif game and action in ("draw", "replace", "toss"):
                context += [data["stage"], game["turn"], data.get("turnSerial", 0), data["motion"],
                            game["drawn"], game["deck"][-1]["id"] if game["deck"] else None,
                            game["discard"][-1]["id"] if game["discard"] else None]
            elif action == "restart":
                context += [data["host"]]
        return hashlib.sha256(json.dumps(context, sort_keys=True).encode()).hexdigest()

    def view(self, data, actor):
        mine = self.seat(data, actor)
        self.record_completed_holes(data)
        reviewing = self.reviewing_hole(data, mine)
        seats = [{"name": p["name"], "profileIcon": p["profileIcon"], "isBot": p["isBot"] or p.get("left", False),
                  "cardBack": p.get("cardBack", "argyle"),
                  "connected": any(code == data["code"] and key == p["actor"] for code, key in self.connections.values())}
                 for p in data["seats"]]
        game = copy.deepcopy(data["previousHole"] if reviewing else data.get("game"))
        motion = None if reviewing else data.get("motion")
        hole_records = []
        if game:
            # Historical boards have their own roster, including departed players.
            # Put this viewer first without exposing internal actor identifiers.
            for record in data.get("holeRecords", []):
                if record["hole"] > game["hole"]:
                    continue
                players = record["players"]
                first = next((i for i, player in enumerate(players) if player["actor"] == actor), 0)
                order = [(first + i) % len(players) for i in range(len(players))]
                hole_records.append({
                    "hole": record["hole"],
                    "wentOut": order.index(record["wentOut"]) if record["wentOut"] is not None else None,
                    "players": [copy.deepcopy({key: value for key, value in players[i].items() if key != "actor"}) for i in order],
                })
            game["deckCount"] = len(game.pop("deck"))
            for seat, player in enumerate(game["players"]):
                for index, cell in enumerate(player["cards"]):
                    # The outgoing card has already reached the discard pile
                    # during the placement flight, even if its grid cell was hidden.
                    outgoing = motion and motion["kind"] == "place" and motion["seat"] == seat and motion["index"] == index
                    if not cell["faceUp"] and not outgoing:
                        cell["card"] = {"id": cell["card"]["id"]}
        return {"code": data["code"], "mode": data["mode"], "capacity": data["capacity"], "revision": data["revision"],
                "actionTokens": {action: self.action_token(data, mine, action) for action in ACTIONS},
                "closed": data.get("closed", False),
                "closedReason": data.get("closedReason"),
                "lobbyReason": data.get("lobbyReason"),
                "mySeat": mine, "isHost": data["host"] == actor, "seats": seats,
                "stage": "playing" if reviewing else data.get("stage", "lobby"), "game": game, "motion": motion,
                "holeRecords": hole_records,
                "ready": data.get("ready", []), "rematchReady": data.get("rematchReady", []),
                "idleWarning": bool(data.get("inactivity", {}).get(str(mine), {}).get("warned"))}

    def publish(self, data):
        for sid, (code, actor) in list(self.connections.items()):
            if code != data["code"]:
                continue
            try:
                self.socketio.emit("golf:state", self.view(data, actor), to=sid, namespace=NAMESPACE)
            except Rejected:
                reason = data.get("removed", {}).get(actor) or next((p.get("removedReason") for p in data["seats"] if p["actor"] == actor), None)
                self.socketio.emit("golf:removed", {"code": code, "reason": reason}, to=sid, namespace=NAMESPACE)

    def active_rooms(self, actor):
        with self.lock:
            rooms = []
            for row in Room.query.order_by(Room.updated_at.desc(), Room.code).all():
                data = row.data
                if data.get("closed") or (data["mode"] == "bot" and
                                          (not data.get("game") or data["game"]["phase"] == "game-over")):
                    continue
                try:
                    rooms.append(self.state(actor, data["code"]))
                except Rejected as error:
                    if error.code != "NOT_SEATED":
                        raise
            return rooms

    def transfer_guest_lobbies(self, actor, guest_key):
        """Claim only waiting seats owned by this browser's signed guest cookie."""
        with self.lock:
            for row in Room.query.filter(Room.data["mode"].as_string() == "multiplayer").all():
                data = copy.deepcopy(row.data)
                if data.get("closed") or data.get("game"):
                    continue
                guest = next((p for p in data["seats"] if p["actor"] == guest_key and not p.get("left")), None)
                if guest is None:
                    continue
                existing = next((p for p in data["seats"] if p["actor"] == actor["key"]), None)
                person = existing if existing is not None else guest
                if existing is not None:
                    data["seats"].remove(guest)
                user = actor["user"]
                person.update(actor=actor["key"], userId=user.id, name=user.username, profileIcon=user.profile_icon, cardBack=user.golf_card_back)
                if data["host"] == guest_key:
                    data["host"] = actor["key"]
                    # The lobby displays the host first, including when merging
                    # a duplicate seat left by an older client.
                    data["seats"].remove(person)
                    data["seats"].insert(0, person)
                receipts = data["receipts"].pop(guest_key, [])
                data["receipts"].setdefault(actor["key"], []).extend(receipts)
                if data.get("createRequest", [None])[0] == guest_key:
                    data["createRequest"][0] = actor["key"]
                # A socket authenticated as a guest must not inherit an account
                # seat. Its replacement reconnects with the current cookies.
                old_sids = [sid for sid, (code, key) in self.connections.items() if code == row.code and key == guest_key]
                for sid in old_sids:
                    self.connections.pop(sid, None)
                self.save(row, data, "signed_in")
                for sid in old_sids:
                    self.socketio.server.disconnect(sid, namespace=NAMESPACE)

    def record_completed_holes(self, data):
        """Archive only finished boards; never include a live hole's hidden cards."""
        records = data.setdefault("holeRecords", [])
        for game in (data.get("previousHole"), data.get("game")):
            if (not game or game["phase"] not in ("round-over", "game-over")
                    or any(record["hole"] == game["hole"] for record in records)
                    or not game["history"] or len(game["history"][-1]) != len(game["players"])):
                continue
            scores = game["history"][-1]
            players = []
            for seat, (person, player) in enumerate(zip(data["seats"], game["players"])):
                penalty = scores[seat] - engine.score_grid(player["cards"])
                players.append({
                    "actor": person["actor"], "name": person["name"], "icon": person["profileIcon"],
                    "isBot": person["isBot"] or person.get("left", False),
                    "cards": copy.deepcopy([cell["card"] for cell in player["cards"]]), "score": scores[seat],
                    **({"penalty": penalty} if penalty > 0 else {}),
                })
            records.append({"hole": game["hole"], "wentOut": game.get("wentOut", (game["turn"] + 1) % len(players)), "players": players})
        records.sort(key=lambda record: record["hole"])

    def save(self, row, data, kind, seat=None, detail=None):
        self.record_completed_holes(data)
        self.sync_inactivity(data)
        data["revision"] += 1
        row.data = copy.deepcopy(data)
        row.updated_at = datetime.utcnow()
        if data.get("game"):
            db.session.add(Event(game_id=data["game"]["id"], revision=data["revision"], seat=seat, kind=kind, detail=detail or {}))
        db.session.add(row)
        db.session.commit()
        self.publish(data)

    def create(self, actor, count, mode, request_id, name=None):
        if type(count) is not int or not 2 <= count <= 6 or mode not in ("bot", "multiplayer"):
            raise Rejected("Choose two to six players.")
        if not isinstance(request_id, str) or not 8 <= len(request_id) <= 64:
            raise Rejected("A game request ID is required.")
        with self.lock:
            for row in Room.query.all():
                if row.data.get("createRequest") == [actor["key"], request_id]:
                    return self.state(actor, row.code)
            code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            while db.session.get(Room, code):
                code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            data = {"code": code, "mode": mode, "capacity": count, "host": actor["key"], "seats": [self.person(actor, name)],
                    "revision": 0, "game": None, "motion": None, "next": None, "receipts": {}, "createRequest": [actor["key"], request_id]}
            if mode == "bot":
                self.fill_bots(data)
                self.begin(data)
            row = Room(code=code, data=data)
            self.save(row, data, "created")
            return self.view(data, actor["key"])

    def fill_bots(self, data):
        while len(data["seats"]) < data["capacity"]:
            i = sum(p["isBot"] for p in data["seats"])
            data["seats"].append({"actor": f"bot:{i}", "userId": None, "name": BOT_NAMES[i], "profileIcon": "robot", "cardBack": "argyle", "isBot": True, "left": False})

    def begin(self, data):
        data.pop("removed", None)
        data.pop("lobbyReason", None)
        # Convert legacy departed seats saved before multiplayer seats were removed.
        if data["mode"] == "multiplayer":
            data["seats"] = [p for p in data["seats"] if not p.get("left")]
            data["capacity"] = len(data["seats"])
        # A departed account must not acquire results in later rematches.
        used_names = {p["name"] for p in data["seats"] if p["isBot"] and not p.get("left")}
        for person in data["seats"]:
            if not person.get("left"):
                continue
            old_actor = person["actor"]
            name = next(name for name in BOT_NAMES if name not in used_names)
            used_names.add(name)
            person.update(actor="bot:" + secrets.token_hex(8), userId=None, name=name, profileIcon="robot", cardBack="argyle", isBot=True, left=False)
            data["receipts"].pop(old_actor, None)
            if data.get("createRequest", [None])[0] == old_actor:
                data["createRequest"] = ["left", "left"]
        if not any(p["actor"] == data["host"] and not p["isBot"] for p in data["seats"]):
            data["host"] = next(p["actor"] for p in data["seats"] if not p["isBot"])
        data.update(game=engine.deal(len(data["seats"])), holeRecords=[], stage="dealing", motion=None, previousHole=None, ready=[], rematchReady=[],
                    startedAt=time.time(), humanCount=sum(not p["isBot"] for p in data["seats"]),
                    metrics=[{} for _ in data["seats"]], revealBusy={}, turnSerial=0, lastAutoplay=None)
        self.schedule(data, "opening", self.delay("deal"))
        save_results(data)

    def join(self, actor, code, name=None):
        with self.lock:
            row = self.get(code)
            data = copy.deepcopy(row.data)
            if data.get("closed"):
                raise Rejected(self.closed_message(data), "LOBBY_CLOSED")
            try:
                self.seat(data, actor["key"])
                return self.state(actor, code)
            except Rejected:
                pass
            if data["game"] or len(data["seats"]) >= data["capacity"]:
                raise Rejected("This lobby has already started or is full.")
            if not data["seats"]:
                data["host"] = actor["key"]
            data["seats"].append(self.person(actor, name))
            self.save(row, data, "joined")
            return self.view(data, actor["key"])

    def subscribe(self, sid, actor, code):
        with self.lock:
            row = self.get(code)
            self.seat(row.data, actor["key"])
            self.connections[sid] = (row.code, actor["key"])
            data = copy.deepcopy(row.data)
            self.refresh_appearance(data, actor)
            self.save(row, data, "connected")
            return self.view(data, actor["key"])

    def disconnect(self, sid):
        with self.lock:
            previous = self.connections.pop(sid, None)
            if previous:
                row = db.session.get(Room, previous[0])
                if row:
                    self.save(row, copy.deepcopy(row.data), "disconnected")

    def bump(self, data, seat, key):
        metrics = data["metrics"][seat]
        metrics[key] = metrics.get(key, 0) + 1

    def open_for(self, data, seat):
        cards = data["game"]["players"][seat]["cards"]
        before = sum(cell["faceUp"] for cell in cards)
        engine.open_bot(data["game"], seat)
        for _ in range(sum(cell["faceUp"] for cell in cards) - before):
            self.bump(data, seat, "cards_revealed")

    def finish_opening(self, data):
        if all(p["isBot"] or p.get("left") or sum(c["faceUp"] for c in data["game"]["players"][i]["cards"]) == 2 for i, p in enumerate(data["seats"])):
            for i, person in enumerate(data["seats"]):
                if person["isBot"] or person.get("left"):
                    self.open_for(data, i)
            data["stage"] = "opponents"
            self.schedule(data, "upcard", self.delay("opponents"))

    def begin_motion(self, data, kind, seat, index=-1, source="deck"):
        game = data["game"]
        if kind == "draw":
            if source not in ("deck", "discard") or not game[source]:
                raise Rejected("Choose an available draw pile.")
            card, origin, target, flip = game[source][-1], source, f"drawn-{seat}", source == "deck"
        elif kind == "discard":
            cell = game["players"][seat]["cards"][index]
            card, origin, target, flip = cell["card"], f"card-{seat}-{index}", "discard", not cell["faceUp"]
            source = game["drawn"]["source"]
        elif kind == "toss":
            card, origin, target, flip = game["drawn"]["card"], f"drawn-{seat}", "discard", False
        elif kind == "upcard":
            card, origin, target, flip = game["deck"][-1], "deck", "discard", True
        else:
            raise Rejected("Unknown animation.")
        data["motion"] = {"kind": kind, "card": copy.deepcopy(card), "from": origin, "to": target,
                          "flip": flip, "seat": seat, "index": index, "source": source}
        self.schedule(data, "arrival", self.delay("flight"))

    def next_turn(self, data):
        game = data["game"]
        data["motion"] = None
        data["next"] = None
        if game["phase"] in ("round-over", "game-over"):
            count_hole(data)
            save_results(data, terminal=game["phase"] == "game-over")
            data["ready"] = []
            data["previousHole"] = None
            return
        person = data["seats"][game["turn"]]
        automatic = person["isBot"] or person.get("left")
        if automatic:
            self.schedule(data, "bot", self.delay("bot_draw" if game["phase"] == "draw" else "bot_replace"))

    def resume_ready(self, data):
        game = data["game"]
        if game["phase"] != "round-over":
            return
        humans = [i for i, p in enumerate(data["seats"]) if not p["isBot"] and not p.get("left")]
        if not any(i in data["ready"] for i in humans):
            return
        # Each player keeps the completed board until choosing the next hole.
        self.record_completed_holes(data)
        data.update(previousHole=game, game=engine.next_hole(game), stage="dealing", motion=None, revealBusy={})
        self.schedule(data, "opening", self.delay("deal"))

    def command(self, actor, code, payload):
        if not isinstance(payload, dict):
            raise Rejected("Invalid game command.")
        action_id = payload.get("actionId")
        if not isinstance(action_id, str) or not 8 <= len(action_id) <= 64:
            raise Rejected("An action ID is required.")
        with self.lock:
            row = self.get(code)
            data = copy.deepcopy(row.data)
            seat = self.seat(data, actor["key"])
            appearance_changed = self.refresh_appearance(data, actor)
            receipts = data["receipts"].setdefault(actor["key"], [])
            if action_id in receipts:
                if appearance_changed:
                    self.save(row, data, "appearance")
                return self.view(data, actor["key"])
            action = payload.get("action")
            revision = payload.get("revision")
            # Older clients retain the exact-revision guard. New clients carry
            # the decision they displayed; never rebase an outdated move.
            current = revision == data["revision"]
            if "actionToken" in payload:
                current = isinstance(payload["actionToken"], str) and payload["actionToken"] == self.action_token(data, seat, action)
            if type(revision) is not int or not 0 <= revision <= data["revision"] or not current:
                raise Rejected("The table changed. Please try that move again.", "STALE_STATE")
            game = data["game"]
            if data.get("closed") and action not in ("close", "leave"):
                raise Rejected(self.closed_message(data), "LOBBY_CLOSED")
            if action == "close":
                if game or data["host"] != actor["key"]:
                    raise Rejected("Only the host can close a waiting lobby.")
                data.update(closed=True, stage="closed", next=None)
                receipts.append(action_id)
                self.save(row, data, "closed", seat)
                return self.view(data, actor["key"])
            if action == "leave":
                if data["mode"] == "multiplayer":
                    self.remove_participant(data, seat)
                    self.save(row, data, "left", seat)
                    return {"left": True}
                person = data["seats"][seat]
                if game:
                    if game["phase"] == "game-over":
                        save_results(data, terminal=True)
                    person["left"] = True
                    humans = [p for p in data["seats"] if not p["isBot"] and not p.get("left")]
                    if data["host"] == actor["key"] and humans:
                        data["host"] = humans[0]["actor"]
                    save_results(data)
                    if not humans:
                        save_results(data, terminal=True, abandoned=game["phase"] != "game-over")
                        data["next"] = None
                    elif game["phase"] == "game-over":
                        pass
                    elif data["stage"] == "opening":
                        self.open_for(data, seat)
                        self.finish_opening(data)
                    elif not data["motion"] and game["phase"] in ("draw", "replace"):
                        self.next_turn(data)
                    elif game["phase"] in ("round-over", "game-over"):
                        self.resume_ready(data)
                else:
                    data["seats"].pop(seat)
                    if data["host"] == actor["key"] and data["seats"]:
                        data["host"] = data["seats"][0]["actor"]
                receipts.append(action_id)
                self.save(row, data, "left", seat)
                return {"left": True}
            if action == "start":
                if game or data["host"] != actor["key"]:
                    raise Rejected("Only the host can start this lobby.")
                if len(data["seats"]) < 2:
                    raise Rejected("Wait for at least one other player.")
                data.setdefault("lobbyCapacity", data["capacity"])
                if len(data["seats"]) < data["capacity"]:
                    if payload.get("fillBots") is True:
                        self.fill_bots(data)
                    else:
                        data["capacity"] = len(data["seats"])
                self.begin(data)
            elif not game:
                raise Rejected("The host has not started this game yet.")
            elif action == "reveal":
                index = payload.get("index")
                if self.reviewing_hole(data, seat):
                    raise Rejected("Continue to the next hole before flipping a card.")
                if data["stage"] != "opening":
                    raise Rejected("Starting cards can only be flipped at the start of a hole.")
                engine.reveal(game, seat, index)
                self.bump(data, seat, "cards_revealed")
                self.finish_opening(data)
            elif action in ("advance", "restart"):
                expected = "round-over" if action == "advance" else "game-over"
                visible_game = data["previousHole"] if self.reviewing_hole(data, seat) else game
                if visible_game["phase"] != expected:
                    raise Rejected("Finish the current game or hole first.")
                if action == "restart":
                    if data["host"] != actor["key"]:
                        raise Rejected("Only the host can start a new game.")
                    if data["mode"] == "multiplayer" and sum(not p["isBot"] and not p.get("left") for p in data["seats"]) < 2:
                        raise Rejected("A multiplayer game needs two people. Create a new table to invite friends.")
                    self.begin(data)
                else:
                    if seat not in data["ready"]:
                        data["ready"].append(seat)
                    self.resume_ready(data)
            else:
                if data["stage"] != "playing" or data["motion"] or game["turn"] != seat:
                    raise Rejected("Wait for your turn and the current card to arrive.")
                if action == "draw" and game["phase"] == "draw":
                    self.begin_motion(data, "draw", seat, source=payload.get("source"))
                elif action == "replace" and game["phase"] == "replace":
                    index = payload.get("index")
                    if type(index) is not int or not 0 <= index < 6:
                        raise Rejected("Choose a card on your board.")
                    self.begin_motion(data, "discard", seat, index)
                elif action == "toss" and game["phase"] == "replace" and game["drawn"]["source"] == "deck":
                    self.begin_motion(data, "toss", seat)
                else:
                    raise Rejected("That move is not available now.")
            receipts.append(action_id)
            del receipts[:-100]
            self.save(row, data, action, seat)
            return self.view(data, actor["key"])

    def step(self, data, kind):
        # Discard saved deadlines from the old automatic-human-move policy.
        if kind in ("opening_timeout", "turn_timeout", "round_timeout"):
            return
        game = data["game"]
        if kind == "opening":
            data["stage"] = "opening"
        elif kind == "upcard":
            data["stage"] = "upcard"
            self.begin_motion(data, "upcard", game["starter"])
        elif kind == "playing":
            game["phase"], data["stage"] = "draw", "playing"
            self.next_turn(data)
        elif kind == "bot":
            seat = game["turn"]
            person = data["seats"][seat]
            bot_name = person["name"] if person["isBot"] else None
            if game["phase"] == "draw":
                self.begin_motion(data, "draw", seat, source=engine.bot_source(game, bot_name))
            elif game["phase"] == "replace":
                index = engine.replacement_index(game, game["drawn"]["card"], game["drawn"]["source"] == "discard", bot_name)
                self.begin_motion(data, "toss" if index < 0 else "discard", seat, index)
        elif kind == "arrival":
            motion = data["motion"]
            seat = motion["seat"]
            if motion["kind"] == "draw":
                engine.draw(game, motion["source"])
                self.bump(data, seat, "deck_draws" if motion["source"] == "deck" else "discard_draws")
                self.next_turn(data)
            elif motion["kind"] == "discard":
                data["motion"] = {**motion, "kind": "place", "card": game["drawn"]["card"], "from": f"drawn-{seat}", "to": f"card-{seat}-{motion['index']}", "flip": False}
                self.schedule(data, "arrival", self.delay("flight"))
            elif motion["kind"] == "place":
                if not game["players"][seat]["cards"][motion["index"]]["faceUp"]:
                    self.bump(data, seat, "cards_revealed")
                engine.replace(game, motion["index"])
                data["turnSerial"] = data.get("turnSerial", 0) + 1
                self.bump(data, seat, "replacements")
                self.next_turn(data)
            elif motion["kind"] == "toss":
                engine.toss(game)
                data["turnSerial"] = data.get("turnSerial", 0) + 1
                self.bump(data, seat, "discarded_draws")
                self.next_turn(data)
            elif motion["kind"] == "upcard":
                game["discard"].append(game["deck"].pop())
                self.step(data, "playing")

    def sync_inactivity(self, data):
        """Time decisions on the server, independently of socket presence."""
        self.close_if_empty(data)
        # Clear disconnect deadlines saved by older releases. Membership lasts
        # until an explicit departure or an in-game decision timeout.
        data["lobbyDisconnects"] = {}
        data["lobbyDisconnectAt"] = None
        game = data.get("game")
        timers = data.setdefault("inactivity", {})
        pending = {}
        if data["mode"] == "multiplayer" and not data.get("closed") and game and game["phase"] != "game-over":
            for seat, person in enumerate(data["seats"]):
                if person["isBot"] or person.get("left"):
                    continue
                actionable = (
                    self.reviewing_hole(data, seat)
                    or data["stage"] == "opening" and sum(c["faceUp"] for c in game["players"][seat]["cards"]) < 2
                    or data["stage"] == "playing" and not data["motion"] and game["turn"] == seat and game["phase"] in ("draw", "replace")
                    or game["phase"] == "round-over" and seat not in data["ready"]
                )
                if actionable:
                    reviewing = self.reviewing_hole(data, seat)
                    visible_game = data["previousHole"] if reviewing else game
                    decision = [visible_game["id"], visible_game["hole"], "playing" if reviewing else data["stage"], visible_game["phase"], data.get("turnSerial", 0), sum(c["faceUp"] for c in visible_game["players"][seat]["cards"])]
                    pending[str(seat)] = ("idle", decision)
        for seat in list(timers):
            if seat not in pending:
                timers.pop(seat)
        for seat, (kind, decision) in pending.items():
            old = timers.get(seat)
            if not old or (old["kind"], old["decision"]) != (kind, decision):
                timers[seat] = dict(kind=kind, decision=decision, warned=False, at=time.time() + IDLE_WARNING_SECONDS)
        data["inactivityAt"] = min((t["at"] for t in timers.values()), default=None)

    def close_if_empty(self, data):
        if data["mode"] == "multiplayer" and not any(not p["isBot"] and not p.get("left") for p in data["seats"]):
            data.update(closed=True, stage="closed", next=None, motion=None)

    def closed_message(self, data):
        if data.get("closedReason") == "not_enough_players":
            return "There aren’t enough players to continue. The lobby has closed."
        return "The host closed this lobby."

    def remove_participant(self, data, seat, reason=None):
        """Keep every seat-indexed board, animation and timer aligned after a departure."""
        self.record_completed_holes(data)
        person = data["seats"][seat]
        game = data.get("game")
        finished = game and game["phase"] == "game-over"
        if finished:
            save_results(data, terminal=True)
        person["left"] = True
        save_results(data)
        if reason:
            data.setdefault("removed", {})[person["actor"]] = reason
        data["seats"].pop(seat)
        data["receipts"].pop(person["actor"], None)
        if data.get("createRequest", [None])[0] == person["actor"]:
            data["createRequest"] = ["left", "left"]
        humans = [p for p in data["seats"] if not p["isBot"] and not p.get("left")]
        if humans and data["host"] == person["actor"]:
            data["host"] = humans[0]["actor"]

        def remap(index):
            return index - (index > seat)

        for key in ("ready", "rematchReady"):
            data[key] = [remap(index) for index in data.get(key, []) if index != seat]
        for key in ("revealBusy", "inactivity"):
            data[key] = {str(remap(int(index))): value for index, value in data.get(key, {}).items() if int(index) != seat}
        if game:
            phase = game["phase"]
            engine.remove_player(game, seat)
            if data.get("previousHole"):
                engine.remove_player(data["previousHole"], seat)
            data["metrics"].pop(seat)
            data["humanCount"] = len(humans)
            data["capacity"] = len(data["seats"])
            motion = data.get("motion")
            if motion:
                if motion["seat"] == seat and motion["kind"] != "upcard":
                    data.update(motion=None, next=None)
                else:
                    motion["seat"] = game["starter"] if motion["kind"] == "upcard" else remap(motion["seat"])
                    for key in ("from", "to"):
                        anchor = motion[key].split("-")
                        if anchor[0] in ("card", "drawn"):
                            anchor[1] = str(remap(int(anchor[1])))
                            motion[key] = "-".join(anchor)
        if len(data["seats"]) < 2 or not humans:
            if game and not finished:
                save_results(data, cancelled=True)
            if not humans:
                data.update(closed=True, closedReason="not_enough_players", stage="closed", next=None, motion=None)
            elif game:
                # Ending a game must not take the remaining player's invitation
                # away. Keep the room available for a fresh game with new players.
                data.update(game=None, previousHole=None, stage="lobby", next=None, motion=None,
                            capacity=max(2, data.get("lobbyCapacity", data["capacity"])),
                            ready=[], rematchReady=[], revealBusy={}, inactivity={}, inactivityAt=None,
                            lobbyReason="not_enough_players")
            return
        if not game or finished:
            return
        if phase in ("draw", "replace") and game["phase"] in ("round-over", "game-over"):
            self.next_turn(data)
        elif data["stage"] == "opening":
            self.finish_opening(data)
        elif game["phase"] == "round-over":
            self.resume_ready(data)
        elif data["stage"] == "playing" and not data["motion"]:
            self.next_turn(data)

    def remove_inactive(self, data, seat, reason):
        if data["mode"] == "multiplayer":
            self.remove_participant(data, seat, reason)
            return
        person, game = data["seats"][seat], data["game"]
        if game["phase"] == "game-over":
            save_results(data, terminal=True)
        person.update(left=True, removedReason=reason)
        save_results(data)
        humans = [p for p in data["seats"] if not p["isBot"] and not p.get("left")]
        if not humans:
            save_results(data, terminal=True, abandoned=game["phase"] != "game-over")
            data["next"] = None
            return
        if data["host"] == person["actor"]:
            data["host"] = humans[0]["actor"]
        if game["phase"] == "game-over":
            return
        if data["stage"] == "opening":
            self.open_for(data, seat)
            self.finish_opening(data)
        elif game["phase"] == "round-over":
            self.resume_ready(data)
        elif not data["motion"] and game["phase"] in ("draw", "replace"):
            self.next_turn(data)

    def tick(self, now=None):
        now = time.time() if now is None else now
        with self.lock:
            if not self.recovered:
                # Waiting lobbies also need recovery, including older rooms
                # saved before lobby disconnect clocks existed.
                for row in Room.query.filter(Room.data["mode"].as_string() == "multiplayer").all():
                    if row.data.get("closed"):
                        continue
                    data = copy.deepcopy(row.data)
                    self.sync_inactivity(data)
                    if data != row.data:
                        self.save(row, data, "recovered")
                self.recovered = True
            rows = Room.query.filter(db.or_(Room.data["next"]["at"].as_float() <= now, Room.data["inactivityAt"].as_float() <= now,
                                           Room.data["lobbyDisconnectAt"].as_float() <= now)).order_by(Room.updated_at).limit(100).all()
            user_ids = {p["userId"] for row in rows for p in row.data["seats"] if p.get("userId") and row.data.get("inactivityAt") is not None and row.data["inactivityAt"] <= now}
        # Account I/O must stay outside the game lock. An outage cannot cause a loss.
        available = True
        if user_ids:
            try:
                self.app.extensions["accounts"].public_profiles(list(user_ids))
            except AccountsUnavailable:
                available = False
        with self.lock:
            for row in rows:
                db.session.refresh(row)
                data = copy.deepcopy(row.data)
                self.sync_inactivity(data)
                changed = False
                for seat, timer in sorted(data.get("inactivity", {}).items(), key=lambda item: int(item[0]), reverse=True):
                    if timer["at"] > now:
                        continue
                    changed = True
                    if timer["kind"] == "idle" and not timer["warned"]:
                        timer.update(warned=True, at=timer["at"] + IDLE_TIMEOUT_SECONDS - IDLE_WARNING_SECONDS)
                    elif not available or timer.get("recovering"):
                        timer.update(at=time.time() + 30, recovering=not available)
                    else:
                        self.remove_inactive(data, int(seat), timer["kind"])
                event = data.get("next")
                if event and event["at"] <= now:
                    data["next"] = None
                    self.step(data, event["kind"])
                    changed = True
                if changed or data != row.data:
                    self.save(row, data, event["kind"] if event and event["at"] <= now else "inactivity")

    def start(self):
        if self.worker:
            return
        def work():
            while True:
                with self.app.app_context():
                    try:
                        self.tick()
                    except Exception:
                        db.session.rollback()
                        self.app.logger.exception("Golf clock step failed")
                    finally:
                        db.session.remove()
                self.socketio.sleep(0.1)
        self.worker = self.socketio.start_background_task(work)
