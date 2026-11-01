import copy
import pytest
from golf_server import engine
from golf_server.extensions import db
from golf_server.models import Room, Result
from test_golf import create, post, action, state
from golf_server.statistics import save_results


def refresh_session(client):
    token = client.get('/api/golf/session').json['csrf_token']
    client.golf_token = token
    client.golf_headers['X-Golf-CSRF'] = token


@pytest.fixture
def online(app, clients, monkeypatch):
    clock = [1_800_000_000.0]
    monkeypatch.setattr('golf_server.runtime.time.time', lambda: clock[0])
    people = [clients(1), clients(2)]
    code = create(people[0], 3, 'multiplayer')['code']
    assert post(people[1], '/lobbies/join', {'code': code}).status_code == 200
    socketio = app.extensions['socketio']
    sockets = []

    def connect(person):
        refresh_session(person)
        socket = socketio.test_client(app, namespace='/golf', flask_test_client=person,
                                     auth={'csrf_token': person.golf_token}, headers={'Origin': 'http://localhost:3003'})
        assert socket.emit('golf:subscribe', {'code': code}, namespace='/golf', callback=True)['ok']
        sockets.append(socket)
        return socket

    for person in people:
        connect(person)
    assert action(people[0], code, 'start', fillBots=True).status_code == 200
    runtime = app.extensions['golf_runtime']

    def advance(seconds):
        clock[0] += seconds
        with app.app_context():
            runtime.tick(clock[0])

    advance(0)
    assert state(people[0], code)['stage'] == 'opening'
    yield people, sockets, connect, code, runtime, advance, clock
    for socket in sockets:
        if socket.is_connected('/golf'):
            socket.disconnect(namespace='/golf')


def test_opening_decisions_wait_a_year_without_warnings_or_removed_seats(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    before = copy.deepcopy(state(people[0], code)["game"])
    for elapsed in (540, 60, 365 * 86400):
        advance(elapsed)
        current = state(people[0], code)
        assert not current["idleWarning"] and current["game"] == before
        assert len(current["seats"]) == 3 and not current["closed"]
    refresh_session(people[0])
    assert action(people[0], code, "reveal", index=0).status_code == 200
    with app.app_context():
        assert all(result.status == "active" for result in Result.query)


def test_disconnect_and_reconnect_restore_the_same_board_after_a_year(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    before = copy.deepcopy(state(people[0], code)["game"])
    for socket in sockets[:]:
        socket.disconnect(namespace="/golf")
    advance(365 * 86400)
    returned = connect(people[0])
    current = state(people[0], code)
    assert returned.is_connected("/golf")
    assert current["mySeat"] == 0 and current["game"] == before
    assert not current["closed"] and not current["idleWarning"]
    assert len(current["seats"]) == 3 and not current["seats"][0]["isBot"]
    with app.app_context():
        assert not db.session.get(Room, code).data.get("removed")
        assert all(result.status == "active" for result in Result.query)


def test_second_connection_keeps_seat_online(online):
    people, sockets, connect, code, runtime, advance, clock = online
    connect(people[0])
    sockets[0].disconnect(namespace='/golf')
    advance(120)
    assert state(people[1], code)['seats'][0]['connected']
    assert not state(people[1], code)['seats'][0]['isBot']


def setup_phase(app, online, phase):
    people, sockets, connect, code, runtime, advance, clock = online
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        game = data['game']
        for seat in range(3):
            engine.open_bot(game, seat)
        game['discard'].append(game['deck'].pop())
        game.update(phase='draw', turn=0)
        if phase == 'replace':
            engine.draw(game, 'deck')
        elif phase == 'round-over':
            game['phase'] = phase
        data.update(stage='playing', motion=None, next=None, ready=[1] if phase == 'round-over' else [])
        runtime.save(row, data, 'test_setup')


@pytest.mark.parametrize('phase', ['draw', 'replace', 'round-over'])
def test_pending_turns_and_hole_reviews_never_expire(app, online, phase):
    people, sockets, connect, code, runtime, advance, clock = online
    setup_phase(app, online, phase)
    before = copy.deepcopy(state(people[0], code)["game"])
    advance(365 * 86400)
    assert state(people[0], code)["game"] == before
    assert not state(people[0], code)["idleWarning"]
    assert len(state(people[1], code)["seats"]) == 3


def test_game_clock_does_not_need_accounts_to_keep_an_absent_player_seated(app, online, monkeypatch):
    people, sockets, connect, code, runtime, advance, clock = online
    setup_phase(app, online, "draw")
    def profiles(ids):
        raise AssertionError("Waiting for a player must not poll account availability")
    monkeypatch.setattr(app.extensions["accounts"], "public_profiles", profiles)
    sockets[0].disconnect(namespace="/golf")
    advance(365 * 86400)
    assert len(state(people[1], code)["seats"]) == 3
    assert not state(people[1], code)["closed"]


def test_finished_games_preserve_disconnected_seats_without_an_idle_deadline(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data['game']['phase'] = 'game-over'
        data['next'] = None
        runtime.save(row, data, 'test_setup')
    for socket in sockets[:]:
        socket.disconnect(namespace='/golf')
    advance(30 * 24 * 3600)
    connect(people[0])
    assert state(people[0], code)['mySeat'] == 0
    assert len(state(people[0], code)['seats']) == 3
    assert not state(people[0], code)['closed']


@pytest.mark.parametrize('kind', ['opening_timeout', 'turn_timeout', 'round_timeout'])
def test_legacy_human_deadlines_do_not_make_automatic_moves(app, online, kind):
    people, sockets, connect, code, runtime, advance, clock = online
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data['next'] = {'kind': kind, 'at': clock[0]}
        row.data = data
        db.session.commit()
    before = state(people[0], code)['game']
    advance(0)
    assert state(people[0], code)['game'] == before


def test_restart_discards_legacy_kick_deadlines_and_preserves_the_original_game(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    before = copy.deepcopy(state(people[0], code)["game"])
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data.update(inactivity={"0": {"kind": "idle", "warned": True, "at": clock[0] - 1}}, inactivityAt=clock[0] - 1)
        row.data = data
        db.session.commit()
        runtime.connections.clear()
        runtime.recovered = False
    advance(365 * 86400)
    connect(people[0])
    assert state(people[0], code)["game"] == before
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data["inactivity"] == {} and data["inactivityAt"] is None
        assert not data.get("closed") and len(data["seats"]) == 3


def test_restart_closes_an_old_bot_filled_game_with_only_one_remaining_human(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data["seats"][1]["left"] = True
        save_results(data)
        data["seats"].pop(1)
        engine.remove_player(data["game"], 1)
        data["metrics"].pop(1)
        data.update(humanCount=1, next=None)
        row.data = data
        db.session.commit()
        runtime.recovered = False
    advance(0)
    assert state(people[0], code)["closed"]
    assert people[0].get("/api/golf/active").json["rooms"] == []
    with app.app_context():
        assert Result.query.filter_by(user_id=1).one().status == "cancelled"
        assert Result.query.filter_by(user_id=2).one().status == "abandoned"
        assert not any(result.won for result in Result.query)
