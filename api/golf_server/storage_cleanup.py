"""Discard retired boards and diagnostic events, preserving result records."""

import copy
import time
from datetime import datetime, timezone

from .extensions import db
from .models import DeletedUser, Event, Result, Room

RETENTION_SECONDS = 24 * 60 * 60
CLEANUP_INTERVAL_SECONDS = 60 * 60


def timestamp(value):
    return value.replace(tzinfo=timezone.utc).timestamp()


def mark_terminal(data, now=None):
    now = time.time() if now is None else now
    game = data.get("game")
    if data.get("closed"):
        data.setdefault("_closed_at", now)
    if game and game["phase"] == "game-over":
        if data.get("_finished_game") != game["id"]:
            data.update(_finished_game=game["id"], _finished_at=now)


def compact(data):
    game = data.get("game")
    return {
        "_storage_pruned": True,
        "_closed_at": data.get("_closed_at", data.get("_finished_at")),
        "code": data["code"],
        "mode": data["mode"],
        "capacity": data["capacity"],
        "revision": data["revision"],
        "closed": True,
        "closedReason": data.get("closedReason")
        or ("completed" if game and game["phase"] == "game-over" else None),
        "stage": "closed",
        "host": data["host"],
        "createRequest": data.get("createRequest"),
        "seats": [
            {
                key: person[key]
                for key in (
                    "actor",
                    "userId",
                    "name",
                    "profileIcon",
                    "cardBack",
                    "isBot",
                    "left",
                )
                if key in person
            }
            for person in data["seats"]
        ],
        "game": None,
        "motion": None,
        "next": None,
        "receipts": {},
        "ready": [],
        "rematchReady": [],
        "revealBusy": {},
        "inactivity": {},
        "inactivityAt": None,
        "lobbyDisconnectAt": None,
        "final_game": (
            {
                "id": game["id"],
                "scores": [p["score"] for p in game["players"]],
                "history": game.get("history", []),
            }
            if game
            else data.get("final_game")
        ),
    }


def cleanup_closed_games(runtime, now=None, *, room_limit=200, event_limit=10000):
    """Run under the runtime lock; never alter Result or AchievementUnlock."""
    now = time.time() if now is None else now
    cutoff = now - RETENTION_SECONDS
    connected = {code for code, _ in runtime.connections.values()}
    protected_ids = set()
    retired = 0
    rows = Room.query.filter(
        Room.data["_storage_pruned"].as_boolean().is_not(True)
    ).all()
    for row in rows:
        data = row.data
        game = data.get("game")
        finished = bool(game and game["phase"] == "game-over")
        if not data.get("closed") and not finished:
            if game:
                protected_ids.add(game["id"])
            continue
        terminal_at = (
            data.get("_closed_at") if data.get("closed") else data.get("_finished_at")
        )
        terminal_at = (
            terminal_at if terminal_at is not None else timestamp(row.updated_at)
        )
        if terminal_at > cutoff:
            if game:
                protected_ids.add(game["id"])
            continue
        if row.code in connected or retired >= room_limit:
            continue
        if game:
            archived = {
                result.user_id: result.status
                for result in Result.query.filter_by(game_id=game["id"])
            }
            owners = {p["userId"] for p in data["seats"] if p.get("userId")}
            if any(
                archived.get(uid) in (None, "active")
                and not db.session.get(DeletedUser, uid)
                for uid in owners
            ):
                protected_ids.add(game["id"])
                continue
        row.data = compact(copy.deepcopy(data))
        retired += 1
    # Old matches may have been replaced by a rematch, or removed by a previous
    # release. Their diagnostic events are also eligible, but live games are not.
    query = Event.query.filter(Event.created_at <= datetime.utcfromtimestamp(cutoff))
    if protected_ids:
        query = query.filter(~Event.game_id.in_(protected_ids))
    # Wait a full day after the last event, rather than pruning early moves
    # immediately when a long-running match ends or starts a rematch.
    recent_games = db.session.query(Event.game_id).filter(
        Event.created_at > datetime.utcfromtimestamp(cutoff)
    )
    query = query.filter(~Event.game_id.in_(recent_games))
    ids = [event.id for event in query.order_by(Event.id).limit(event_limit)]
    if ids:
        Event.query.filter(Event.id.in_(ids)).delete(synchronize_session=False)
    db.session.commit()
    return {"rooms_compacted": retired, "events_deleted": len(ids)}
