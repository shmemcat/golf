"""Retired boards/logs disappear without losing results or resumable games."""

import copy
import time
from datetime import datetime

from golf_server.extensions import db
from golf_server.models import AchievementUnlock, Event, Result, Room
from golf_server.statistics import account_statistics, save_results
from golf_server.storage_cleanup import RETENTION_SECONDS
from test_golf import action, create, state


def finish(app, code, when):
    row = db.session.get(Room, code)
    data = copy.deepcopy(row.data)
    data["game"]["phase"] = "game-over"
    data.update(
        next=None, motion=None, _finished_at=when, _finished_game=data["game"]["id"]
    )
    save_results(data, terminal=True)
    row.data, row.updated_at = data, datetime.utcfromtimestamp(when)
    Event.query.filter_by(game_id=data["game"]["id"]).update(
        {"created_at": datetime.utcfromtimestamp(when)}
    )
    db.session.commit()
    return data["game"]["id"]


def test_retention_boundary_preserves_statistics_and_fences_old_tabs(app, clients):
    host = clients(1)
    request_id = "completed-request"
    code = create(host, rid=request_id)["code"]
    now = time.time()
    with app.app_context():
        game_id = finish(app, code, now)
        db.session.add(AchievementUnlock(user_id=1, achievement_id="geezer"))
        db.session.commit()
        before = account_statistics(1)
        cleanup = app.extensions["cleanup_storage"]
        assert cleanup(now + RETENTION_SECONDS - 1) == {
            "rooms_compacted": 0,
            "events_deleted": 0,
        }
        assert cleanup(now + RETENTION_SECONDS) == {
            "rooms_compacted": 1,
            "events_deleted": 1,
        }
        data = db.session.get(Room, code).data
        assert data["_storage_pruned"] and data["game"] is None
        assert data["final_game"]["id"] == game_id
        assert not any(
            key in data for key in ("previousHole", "metrics", "holeRecords")
        )
        assert account_statistics(1) == before
        assert db.session.get(Result, (game_id, 1)).status == "completed"
        assert cleanup(now + RETENTION_SECONDS)["rooms_compacted"] == 0
    assert state(host, code)["closed"]
    assert create(host, rid=request_id)["code"] == code
    assert action(host, code, "restart").json["code"] == "LOBBY_CLOSED"
    assert action(host, code, "leave").json["state"]["left"]


def test_old_unfinished_and_unarchived_results_keep_their_boards_and_logs(app, clients):
    live = create(clients(1))["code"]
    pending = create(clients(2))["code"]
    now = time.time()
    with app.app_context():
        old = now - RETENTION_SECONDS - 100
        finish(app, pending, old)
        row = db.session.get(Room, pending)
        pending_id = row.data["game"]["id"]
        Result.query.filter_by(game_id=pending_id).delete()
        active = db.session.get(Room, live)
        active_id = active.data["game"]["id"]
        before = copy.deepcopy(active.data)
        active.updated_at = datetime.utcfromtimestamp(old)
        Event.query.filter_by(game_id=active_id).update(
            {"created_at": datetime.utcfromtimestamp(old)}
        )
        db.session.commit()
        assert app.extensions["cleanup_storage"](now) == {
            "rooms_compacted": 0,
            "events_deleted": 0,
        }
        assert db.session.get(Room, live).data == before
        assert db.session.get(Room, pending).data["game"] is not None
        assert Event.query.count() == 2


def test_orphan_logs_are_batched_and_recent_matches_keep_all_moves(app, clients):
    now = time.time()
    with app.app_context():
        for index, game_id in enumerate(
            ["old-rematch", "old-rematch", "recent-match", "recent-match"]
        ):
            db.session.add(
                Event(
                    game_id=game_id,
                    revision=index,
                    kind="draw",
                    detail={},
                    created_at=datetime.utcfromtimestamp(
                        now - (RETENTION_SECONDS + 10 if index != 3 else 10)
                    ),
                )
            )
        db.session.commit()
        from golf_server.storage_cleanup import cleanup_closed_games

        runtime = app.extensions["golf_runtime"]
        assert cleanup_closed_games(runtime, now, event_limit=1)["events_deleted"] == 1
        assert cleanup_closed_games(runtime, now, event_limit=1)["events_deleted"] == 1
        assert {event.game_id for event in Event.query.all()} == {"recent-match"}


def test_connected_results_keep_rematch_available_until_disconnected(app, clients):
    code = create(clients(1))["code"]
    now = time.time()
    with app.app_context():
        finish(app, code, now - RETENTION_SECONDS)
        runtime = app.extensions["golf_runtime"]
        runtime.connections["results-tab"] = (code, "account:1")
        assert runtime.cleanup_storage(now)["rooms_compacted"] == 0
        runtime.connections.clear()
        assert runtime.cleanup_storage(now)["rooms_compacted"] == 1


def test_account_deletion_scrubs_compact_receipts_without_restoring_events(
    app, clients
):
    host = clients(1)
    code = create(host)["code"]
    now = time.time()
    with app.app_context():
        finish(app, code, now - RETENTION_SECONDS)
        app.extensions["cleanup_storage"](now)
    response = app.test_client().post(
        "/_internal/games/v1/golf/delete-user",
        json={"user_id": 1, "request_id": "delete-retired-user"},
        headers={
            "X-Cards-Service": "accounts",
            "Authorization": "Bearer " + app.config["GAME_ACCOUNT_TOKENS"]["golf"],
        },
    )
    assert response.json["deleted"]
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data["_storage_pruned"] and data["game"] is None
        assert data["seats"][0]["userId"] is None
        assert Result.query.count() == Event.query.count() == 0
