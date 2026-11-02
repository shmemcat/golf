import copy
import uuid

from golf_server.extensions import db
from golf_server.models import Room
from test_golf import create, action, post, state, tick


def test_started_invite_is_live_read_only_and_not_a_saved_seat(app, clients):
    host, friend, spectator = clients(1), clients(2), clients()
    code = create(host, mode="multiplayer")["code"]
    assert post(friend, "/lobbies/join", {"code": code}).status_code == 200
    assert action(host, code, "start").status_code == 200
    tick(app)
    with app.app_context():
        before = copy.deepcopy(db.session.get(Room, code).data)
    view = state(spectator, code)
    assert view["mySeat"] is None and view["spectating"] and not view["isHost"]
    assert view["actionTokens"] == {}
    assert all(set(cell["card"]) == {"id"} for p in view["game"]["players"] for cell in p["cards"])
    assert "deck" not in view["game"]
    assert spectator.get("/api/golf/active").json == {"rooms": []}
    assert post(spectator, "/lobbies/join", {"code": code}).json["state"]["spectating"]
    socketio = app.extensions["socketio"]
    socket = socketio.test_client(app, namespace="/golf", flask_test_client=spectator,
        auth={"csrf_token": spectator.golf_token}, headers={"Origin": "http://localhost:3003"})
    assert socket.is_connected("/golf")
    reply = socket.emit("golf:subscribe", {"code": code}, namespace="/golf", callback=True)
    assert reply["ok"] and reply["state"]["spectating"]
    for verb in ("reveal", "advance", "restart", "leave", "close"):
        rejected = post(spectator, f"/rooms/{code}/actions", {
            "action": verb, "index": 0, "actionId": str(uuid.uuid4()), "revision": view["revision"]})
        assert rejected.status_code == 403 and rejected.json["code"] == "NOT_SEATED"
    with app.app_context():
        assert db.session.get(Room, code).data == before
    assert action(host, code, "reveal", index=0).status_code == 200
    events = socket.get_received("/golf")
    live = [e["args"][0] for e in events if e["name"] == "golf:state"][-1]
    assert live["spectating"] and live["revision"] > view["revision"]
    assert state(host, code)["mySeat"] == 0
    socket.disconnect(namespace="/golf")
    with app.app_context():
        assert not app.extensions["golf_runtime"].lobby_departures


def test_practice_tables_stay_private(app, clients):
    host, spectator = clients(1), clients()
    code = create(host)["code"]
    assert spectator.get("/api/golf/rooms/" + code).json["code"] == "NOT_SEATED"
