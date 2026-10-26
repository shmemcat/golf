import copy
import pytest
from golf_server import engine
from golf_server.account_contracts import AccountsUnavailable
from golf_server.extensions import db
from golf_server.models import Room, Result
from test_golf import create, post, action, state


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


def test_opening_warning_at_nine_minutes_clears_on_move_and_removes_at_ten(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    advance(539)
    assert not state(people[0], code)['idleWarning']
    assert not any(c['faceUp'] for c in state(people[0], code)['game']['players'][0]['cards'])
    advance(1)
    assert state(people[0], code)['idleWarning']
    assert state(people[1], code)['idleWarning']
    assert action(people[0], code, 'reveal', index=0).status_code == 200
    assert not state(people[0], code)['idleWarning']
    assert state(people[1], code)['idleWarning']
    advance(59)
    assert not state(people[1], code)['seats'][1]['isBot']
    advance(1)
    value = state(people[0], code)
    assert len(value['seats']) == 2
    assert value['seats'][1]['isBot'] and not value['seats'][0]['isBot']
    assert people[1].get('/api/golf/rooms/' + code).json['code'] == 'NOT_SEATED'
    events = sockets[1].get_received('/golf')
    assert any(e['name'] == 'golf:removed' and e['args'][0]['reason'] == 'idle' for e in events)
    assert not sockets[1].emit('golf:subscribe', {'code': code}, namespace='/golf', callback=True)['ok']
    with app.app_context():
        assert Result.query.filter_by(user_id=2).one().status == 'abandoned'


def test_disconnect_and_reconnect_preserve_the_ten_minute_decision_deadline(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    for index in (0, 4):
        assert action(people[1], code, 'reveal', index=index).status_code == 200
    with app.app_context():
        deadline = copy.deepcopy(db.session.get(Room, code).data['inactivity']['0'])
    sockets[0].disconnect(namespace='/golf')
    advance(539)
    returned = connect(people[0])
    assert state(people[0], code)['mySeat'] == 0
    with app.app_context():
        assert db.session.get(Room, code).data['inactivity']['0'] == deadline
    advance(1)
    assert state(people[0], code)['idleWarning']
    returned.disconnect(namespace='/golf')
    advance(60)
    assert len(state(people[1], code)['seats']) == 2
    with app.app_context():
        assert db.session.get(Room, code).data['removed']['account:1'] == 'idle'
        assert Result.query.filter_by(user_id=1).one().status == 'abandoned'


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
def test_only_the_player_owing_a_decision_can_be_removed(app, online, phase):
    people, sockets, connect, code, runtime, advance, clock = online
    setup_phase(app, online, phase)
    advance(540)
    assert state(people[0], code)['idleWarning']
    assert not state(people[1], code)['idleWarning']
    assert state(people[0], code)['game']['phase'] == phase
    advance(60)
    assert len(state(people[1], code)['seats']) == 2
    assert not state(people[1], code)['seats'][0]['isBot']
    assert state(people[1], code)['seats'][0]['name'] == 'Player 2'
    if phase == 'round-over':
        assert state(people[1], code)['game']['hole'] == 2


def test_removal_pauses_for_account_outages_outside_lock_and_grants_recovery(app, online, monkeypatch):
    people, sockets, connect, code, runtime, advance, clock = online
    setup_phase(app, online, 'draw')
    advance(540)
    available = [False]

    def profiles(ids):
        assert not runtime.lock._is_owned()
        if not available[0]:
            raise AccountsUnavailable()
        return {}

    monkeypatch.setattr(app.extensions['accounts'], 'public_profiles', profiles)
    advance(60)
    assert not state(people[1], code)['seats'][0]['isBot']
    available[0] = True
    advance(30)
    assert not state(people[1], code)['seats'][0]['isBot']
    advance(30)
    assert len(state(people[1], code)['seats']) == 2
    assert state(people[1], code)['seats'][0]['name'] == 'Player 2'


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


def test_restart_preserves_the_server_decision_clock_without_shortening_it(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    with app.app_context():
        deadline = db.session.get(Room, code).data['inactivity']['0']['at']
        runtime.connections.clear()
        runtime.recovered = False
    advance(120)
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['inactivity']['0']['at'] == deadline
        assert len(data['seats']) == 3
    advance(420)
    assert state(people[0], code)['idleWarning']
    advance(60)
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['closed'] and data['next'] is None
