import pytest
from golf_server.extensions import db
from golf_server.models import Room
from test_active_games import create, command, active


def test_last_lobby_connection_closes_waiting_room_and_reconnect_cancels_cleanup(app, clients, monkeypatch):
    player = clients(1)
    room = create(player, "multiplayer")
    runtime = app.extensions["golf_runtime"]
    tasks, delays = [], []
    monkeypatch.setattr(runtime.socketio, "start_background_task", lambda fn: tasks.append(fn))
    monkeypatch.setattr(runtime.socketio, "sleep", delays.append)
    with app.app_context():
        key = db.session.get(Room, room["code"]).data["seats"][0]["actor"]
        actor = {"key": key, "user": app.extensions["accounts"].identity(1)}
        runtime.subscribe("first", actor, room["code"])
        runtime.disconnect("first")
        runtime.subscribe("returning", actor, room["code"])
        tasks.pop(0)()
        db.session.expire_all()
        assert not db.session.get(Room, room["code"]).data.get("closed")
        runtime.disconnect("returning")
        tasks.pop(0)()
        db.session.expire_all()
        assert db.session.get(Room, room["code"]).data["closed"]
    assert active(player) == []
    assert delays == [120, 120]


def test_started_game_does_not_close_when_last_connection_leaves(app, clients, monkeypatch):
    player = clients(1)
    friend = clients(2)
    room = create(player, "multiplayer")
    assert friend.post("/api/golf/lobbies/join", json={"code": room["code"]}, headers=friend.golf_headers).status_code == 200
    assert command(player, room, "start").status_code == 200
    runtime = app.extensions["golf_runtime"]
    tasks = []
    monkeypatch.setattr(runtime.socketio, "start_background_task", lambda fn: tasks.append(fn))
    with app.app_context():
        runtime.connections["first"] = (room["code"], "user:1")
        runtime.disconnect("first")
    assert tasks == []
    assert active(player)[0]["code"] == room["code"]


@pytest.mark.parametrize("guest_also_leaves", [False, True])
def test_waiting_member_expires_and_host_migrates_only_after_the_last_tab_disconnects(app, clients, monkeypatch, guest_also_leaves):
    host, guest = clients(1), clients(2)
    room = create(host, "multiplayer")
    assert guest.post("/api/golf/lobbies/join", json={"code": room["code"]}, headers=guest.golf_headers).status_code == 200
    runtime = app.extensions["golf_runtime"]
    tasks, delays = [], []
    monkeypatch.setattr(runtime.socketio, "start_background_task", lambda fn: tasks.append(fn))
    monkeypatch.setattr(runtime.socketio, "sleep", delays.append)
    with app.app_context():
        people = db.session.get(Room, room["code"]).data["seats"]
        owner = {"key": people[0]["actor"], "user": app.extensions["accounts"].identity(1)}
        friend = {"key": people[1]["actor"], "user": app.extensions["accounts"].identity(2)}
        runtime.subscribe("host", owner, room["code"])
        runtime.subscribe("other-tab", owner, room["code"])
        runtime.subscribe("guest", friend, room["code"])
        runtime.disconnect("host")
        assert tasks == []
        runtime.disconnect("other-tab")
        assert len(db.session.get(Room, room["code"]).data["seats"]) == 2
        if guest_also_leaves:
            runtime.disconnect("guest")
        tasks.pop(0)()
        db.session.expire_all()
        data = db.session.get(Room, room["code"]).data
        assert not data.get("closed") and data["host"] == friend["key"]
        assert [p["actor"] for p in data["seats"]] == [friend["key"]]
        if not guest_also_leaves:
            runtime.disconnect("guest")
        assert not db.session.get(Room, room["code"]).data.get("closed")
        tasks.pop(0)()
        db.session.expire_all()
        assert db.session.get(Room, room["code"]).data["closed"]
    assert delays == [120, 120]
