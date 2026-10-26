import copy
import uuid

import pytest

from golf_server.extensions import db
from golf_server.models import Room
from golf_server.statistics import save_results


def create(client, mode="bot"):
    path = "/bots" if mode == "bot" else "/lobbies"
    response = client.post("/api/golf" + path, json={"players": 3, "requestId": str(uuid.uuid4())}, headers=client.golf_headers)
    assert response.status_code == 200
    return response.json["state"]


def active(client):
    response = client.get("/api/golf/active")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    return response.json["rooms"]


def command(client, room, action):
    state = client.get("/api/golf/rooms/" + room["code"]).json["state"]
    return client.post("/api/golf/rooms/" + room["code"] + "/actions",
                       json={"action": action, "actionId": str(uuid.uuid4()), "revision": state["revision"]},
                       headers=client.golf_headers)


@pytest.mark.parametrize("uid", [None, 1])
def test_active_rooms_are_private_and_survive_revisits(app, clients, uid):
    player, outsider = clients(uid), clients(2)
    assert active(player) == []
    bot = create(player)
    lobby = create(player, "multiplayer")
    rooms = active(player)
    assert [room["code"] for room in rooms] == [lobby["code"], bot["code"]]
    assert rooms[0]["game"] is None
    assert rooms[1]["game"]["id"] == bot["game"]["id"]
    assert "deck" not in rooms[1]["game"]
    assert all(set(cell["card"]) == {"id"} for p in rooms[1]["game"]["players"] for cell in p["cards"])
    assert all("actor" not in seat and "userId" not in seat for room in rooms for seat in room["seats"])
    assert active(outsider) == []
    if uid:
        assert {room["code"] for room in active(clients(uid))} == {bot["code"], lobby["code"]}
    else:
        assert active(clients()) == []


def test_closed_lobbies_and_departed_members_are_ignored(app, clients):
    player = clients(1)
    closed = create(player, "multiplayer")
    left = create(player, "multiplayer")
    conceded = create(player)
    assert command(player, closed, "close").status_code == 200
    assert command(player, left, "leave").status_code == 200
    assert command(player, conceded, "leave").status_code == 200
    assert active(player) == []
    stats = player.get("/api/golf/stats").json["statistics"]["bot"]
    assert stats["games_started"] == stats["games_abandoned"] == 1
    assert stats["games_played"] == stats["games_lost"] == stats["games_won"] == 0
    assert stats["win_rate"] == 0


@pytest.mark.parametrize("mode", ["bot", "multiplayer"])
@pytest.mark.parametrize("phase", ["opening", "draw", "replace", "round-over", "game-over"])
def test_every_game_phase_is_discoverable_except_completed_solo(app, clients, mode, phase):
    player = clients(1)
    room = create(player, mode)
    if mode == "multiplayer":
        friend = clients(2)
        joined = friend.post("/api/golf/lobbies/join", json={"code": room["code"]}, headers=friend.golf_headers)
        assert joined.status_code == 200
        assert command(player, room, "start").status_code == 200
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.data)
        data["game"]["phase"] = phase
        if phase == "game-over":
            save_results(data, terminal=True)
        row.data = data
        db.session.commit()
    rooms = active(player)
    if mode == "bot" and phase == "game-over":
        assert rooms == []
    else:
        assert len(rooms) == 1
        assert rooms[0]["game"]["phase"] == phase
        if mode == "multiplayer":
            assert active(friend)[0]["code"] == room["code"]
            assert command(player, room, "leave").status_code == 200
            assert active(player) == []
            assert active(friend)[0]['code'] == room['code']
            remaining = friend.get("/api/golf/rooms/" + room["code"]).json["state"]
            assert not remaining['closed'] and remaining['stage'] == 'lobby'
            assert remaining['game'] is None


def test_changing_accounts_never_discovers_the_previous_accounts_games(app, clients):
    player = clients(1)
    room = create(player)
    player.set_cookie("test_account", "2")
    assert active(player) == []
    player.delete_cookie("test_account")
    assert active(player) == []
    player.set_cookie("test_account", "1")
    assert active(player)[0]["code"] == room["code"]
