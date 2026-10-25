"""Commands captured before independent updates retain their original intent."""
import copy
import uuid

import pytest

from golf_server.extensions import db
from golf_server.models import Event, Room
from golf_server import engine
from test_golf import action, create, post, state, tick


def command(snapshot, verb, **detail):
    return {"action": verb, "actionId": str(uuid.uuid4()), "revision": snapshot["revision"],
            "actionToken": snapshot["actionTokens"][verb], **detail}


def send(client, code, payload):
    return post(client, f"/rooms/{code}/actions", payload)


@pytest.fixture
def table(app, clients):
    people = [clients(1), clients(2), clients(3)]
    code = create(people[0], 3, "multiplayer")["code"]
    for person in people[1:]:
        assert post(person, "/lobbies/join", {"code": code}).status_code == 200
    assert action(people[0], code, "start").status_code == 200
    tick(app)
    return people, code


def test_players_can_flip_from_the_same_revision_without_replaying_moves(app, table):
    people, code = table
    snapshots = [state(person, code) for person in people]
    payloads = [command(snapshot, "reveal", index=0) for snapshot in snapshots]
    for person, payload in zip(people, payloads):
        assert send(person, code, payload).status_code == 200
    before_retry = state(people[0], code)
    assert send(people[0], code, payloads[0]).json["state"] == before_retry
    # A new ID cannot turn the old first-flip decision into a second flip.
    stale = {**payloads[0], "actionId": str(uuid.uuid4()), "index": 4}
    assert send(people[0], code, stale).status_code == 409
    assert state(people[0], code) == before_retry
    for person in people:
        assert send(person, code, command(state(person, code), "reveal", index=4)).status_code == 200
    with app.app_context():
        assert Event.query.filter_by(kind="reveal").count() == 6


def test_connections_do_not_invalidate_a_flip_or_turn(app, table):
    people, code = table
    first = command(state(people[0], code), "reveal", index=0)
    socket = app.extensions["socketio"].test_client(
        app, namespace="/golf", flask_test_client=people[1],
        headers=people[1].golf_headers, auth={"csrf_token": people[1].golf_token})
    assert socket.emit("golf:subscribe", {"code": code}, namespace="/golf", callback=True)["ok"]
    socket.disconnect(namespace="/golf")
    assert send(people[0], code, first).status_code == 200
    with app.app_context():
        runtime = app.extensions["golf_runtime"]
        row = runtime.get(code)
        data = copy.deepcopy(row.data)
        for seat in range(3):
            engine.open_bot(data["game"], seat)
        data["game"]["discard"].append(data["game"]["deck"].pop())
        data["game"].update(phase="draw", turn=0)
        data.update(stage="playing", motion=None, next=None)
        runtime.save(row, data, "playing")
    draw = command(state(people[0], code), "draw", source="deck")
    socket = app.extensions["socketio"].test_client(
        app, namespace="/golf", flask_test_client=people[1],
        headers=people[1].golf_headers, auth={"csrf_token": people[1].golf_token})
    assert socket.emit("golf:subscribe", {"code": code}, namespace="/golf", callback=True)["ok"]
    assert send(people[0], code, draw).status_code == 200
    tick(app)
    old = {**draw, "actionId": str(uuid.uuid4())}
    assert send(people[0], code, old).status_code == 409
    # The old draw must remain stale when it becomes this player's turn again.
    for seat, person in enumerate(people):
        if seat:
            assert send(person, code, command(state(person, code), "draw", source="deck")).status_code == 200
            tick(app)
        assert send(person, code, command(state(person, code), "toss")).status_code == 200
        tick(app)
    assert state(people[0], code)["game"]["turn"] == 0
    assert send(people[0], code, old).status_code == 409
    socket.disconnect(namespace="/golf")


@pytest.mark.parametrize("flip_first", [False, True])
def test_next_hole_and_other_players_flips_can_arrive_in_either_order(app, table, flip_first):
    people, code = table
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        for player in data["game"]["players"]:
            for card in player["cards"]:
                card["faceUp"] = True
        data["game"].update(phase="round-over", history=[[0, 0, 0]])
        data.update(stage="playing", ready=[], next=None)
        app.extensions["golf_runtime"].save(row, data, "hole_complete")
    # All three players saw the completed hole before the first continued.
    advances = [command(state(person, code), "advance") for person in people]
    assert send(people[0], code, advances[0]).status_code == 200
    tick(app)
    flip = command(state(people[0], code), "reveal", index=0)
    pair = [(people[0], flip), (people[1], advances[1])]
    for person, payload in pair if flip_first else reversed(pair):
        assert send(person, code, payload).status_code == 200
    # The third player may still be reviewing while others open their cards.
    assert state(people[2], code)["game"]["hole"] == 1
    assert send(people[2], code, advances[2]).status_code == 200
    assert all(state(person, code)["game"]["hole"] == 2 for person in people)
    before = state(people[1], code)
    assert send(people[1], code, advances[1]).json["state"] == before
    assert send(people[1], code, {**advances[1], "actionId": str(uuid.uuid4())}).status_code == 409
    assert state(people[1], code) == before


@pytest.mark.parametrize("token", [None, "invalid", "♥", 12, []])
def test_invalid_tokens_cannot_bypass_revision_or_legality(table, token):
    people, code = table
    payload = command(state(people[0], code), "reveal", index=0)
    assert send(people[0], code, {**payload, "actionToken": token}).status_code == 409
    assert send(people[1], code, payload).status_code == 409


def test_old_hole_and_game_decisions_stay_stale_even_when_the_action_is_legal(app, table):
    people, code = table
    payload = command(state(people[0], code), "reveal", index=0)
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data["game"]["hole"] += 1
        app.extensions["golf_runtime"].save(row, data, "next_hole")
    assert send(people[0], code, payload).status_code == 409
    fresh = command(state(people[0], code), "reveal", index=0)
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data["game"]["id"] = str(uuid.uuid4())
        app.extensions["golf_runtime"].save(row, data, "restart")
    assert send(people[0], code, fresh).status_code == 409


@pytest.mark.parametrize("revision", [None, True, -1, 10**9])
def test_tokens_do_not_allow_invalid_or_future_revisions(table, revision):
    people, code = table
    payload = command(state(people[0], code), "reveal", index=0)
    assert send(people[0], code, {**payload, "revision": revision}).status_code == 409


def test_a_join_and_start_can_overlap_and_leaving_does_not_cancel_another_flip(app, clients):
    host, guest, late = clients(1), clients(2), clients(3)
    code = create(host, 3, "multiplayer")["code"]
    assert post(guest, "/lobbies/join", {"code": code}).status_code == 200
    start = command(state(host, code), "start")
    assert post(late, "/lobbies/join", {"code": code}).status_code == 200
    assert send(host, code, start).status_code == 200
    tick(app)
    flip = command(state(host, code), "reveal", index=0)
    leave = command(state(late, code), "leave")
    assert send(guest, code, command(state(guest, code), "reveal", index=0)).status_code == 200
    assert send(late, code, leave).status_code == 200
    assert send(host, code, flip).status_code == 200
