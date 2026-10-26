import copy
import uuid

import pytest

from golf_server.account_contracts import AccountIdentity, AccountsUnavailable
from golf_server.extensions import db
from golf_server.models import Event, Result, Room
from test_golf import action, create, post, state


@pytest.fixture
def lobby(app, clients, monkeypatch):
    clock = [1_800_000_000.0]
    monkeypatch.setattr('golf_server.runtime.time.time', lambda: clock[0])
    people = [clients(1), clients(), clients(3)]
    code = create(people[0], 4, 'multiplayer')['code']
    for person in people[1:]:
        assert post(person, '/lobbies/join', {'code': code}).status_code == 200
    runtime = app.extensions['golf_runtime']
    sockets = []

    def connect(person):
        socket = app.extensions['socketio'].test_client(
            app, namespace='/golf', flask_test_client=person,
            auth={'csrf_token': person.golf_token}, headers={'Origin': 'http://localhost:3003'})
        assert socket.is_connected('/golf')
        assert socket.emit('golf:subscribe', {'code': code}, namespace='/golf', callback=True)['ok']
        sockets.append(socket)
        return socket

    for person in people:
        connect(person)

    def advance(seconds):
        clock[0] += seconds
        with app.app_context():
            runtime.tick(clock[0])

    yield people, sockets, connect, code, runtime, advance, clock
    for socket in sockets:
        if socket.is_connected('/golf'):
            socket.disconnect(namespace='/golf')


@pytest.mark.parametrize('entry', ['session', 'active', 'room', 'join', 'socket'])
def test_sign_in_transfers_the_browser_guest_seat_without_a_duplicate(app, lobby, monkeypatch, entry):
    people, sockets, connect, code, runtime, advance, clock = lobby
    guest = people[1]
    monkeypatch.setattr(app.extensions['accounts'], 'identity', lambda uid: AccountIdentity(uid, f'Player {uid}', 'cat', True))
    # A full lobby must still allow transfer; no extra seat is needed.
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data['capacity'] = 3
        row.data = data
        db.session.commit()
    guest.set_cookie('test_account', '2')
    if entry == 'session':
        assert guest.get('/api/golf/session').status_code == 200
    elif entry == 'active':
        assert guest.get('/api/golf/active').json['rooms'][0]['mySeat'] == 1
    elif entry == 'room':
        assert guest.get('/api/golf/rooms/' + code).status_code == 200
    elif entry == 'join':
        assert post(guest, '/lobbies/join', {'code': code}).status_code == 200
    else:
        connect(guest)
    value = state(guest, code)
    assert value['mySeat'] == 1
    assert not value['isHost']
    assert len(value['seats']) == 3
    assert value['seats'][1]['name'] == 'Player 2'
    assert value['seats'][1]['profileIcon'] == 'cat'
    assert not sockets[1].is_connected('/golf')
    if entry != 'socket':
        connect(guest)
    assert state(people[0], code)['seats'][1]['connected']
    assert post(guest, '/lobbies/join', {'code': code}).json['state']['mySeat'] == 1
    advance(61)
    assert len(state(people[0], code)['seats']) == 3
    updates = sockets[0].get_received('/golf')
    assert any(e['name'] == 'golf:state' and e['args'][0]['seats'][1]['name'] == 'Player 2' for e in updates)
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['seats'][1]['actor'] == 'account:2'
        assert data['seats'][1]['userId'] == 2
        assert Result.query.count() == Event.query.count() == 0


def test_guest_host_keeps_hosting_and_creation_retry_after_sign_in(app, clients):
    host = clients()
    request_id = str(uuid.uuid4())
    room = create(host, 3, 'multiplayer', rid=request_id)
    friend = clients(2)
    assert post(friend, '/lobbies/join', {'code': room['code']}).status_code == 200
    host.set_cookie('test_account', '1')
    value = state(host, room['code'])
    assert value['mySeat'] == 0 and value['isHost']
    assert value['seats'][0]['name'] == 'Player 1'
    assert create(host, 3, 'multiplayer', rid=request_id)['code'] == room['code']
    assert action(host, room['code'], 'start').status_code == 200


@pytest.mark.parametrize('guest_is_host', [False, True])
def test_sign_in_merges_an_existing_account_seat(app, clients, guest_is_host):
    guest, account, friend = clients(), clients(2), clients(3)
    host = guest if guest_is_host else friend
    code = create(host, 4, 'multiplayer')['code']
    for person in ([friend, account] if guest_is_host else [guest, account]):
        assert post(person, '/lobbies/join', {'code': code}).status_code == 200
    guest.set_cookie('test_account', '2')
    value = state(guest, code)
    assert len(value['seats']) == 2
    assert value['mySeat'] == (0 if guest_is_host else 1)
    assert value['isHost'] == guest_is_host
    with app.app_context():
        assert [p['actor'] for p in db.session.get(Room, code).data['seats']].count('account:2') == 1


def test_sign_in_cannot_claim_another_browsers_guest_or_an_accounts_seat(app, lobby, clients):
    people, sockets, connect, code, runtime, advance, clock = lobby
    assert clients(2).get('/api/golf/rooms/' + code).json['code'] == 'NOT_SEATED'
    people[0].set_cookie('test_account', '2')
    assert people[0].get('/api/golf/rooms/' + code).json['code'] == 'NOT_SEATED'
    people[0].set_cookie('test_account', '1')
    assert state(people[0], code)['isHost']
    people[1].set_cookie('test_account', '2')
    assert state(people[1], code)['mySeat'] == 1
    people[1].delete_cookie('test_account')
    assert people[1].get('/api/golf/rooms/' + code).json['code'] == 'NOT_SEATED'
    people[1].set_cookie('test_account', '3')
    assert state(people[1], code)['mySeat'] == 2
    with app.app_context():
        assert db.session.get(Room, code).data['seats'][1]['userId'] == 2


@pytest.mark.parametrize('mode', ['bot', 'multiplayer'])
def test_sign_in_does_not_claim_started_games_or_retroactively_award_results(app, clients, mode):
    guest = clients()
    code = create(guest, 3, mode)['code']
    if mode == 'multiplayer':
        assert post(clients(2), '/lobbies/join', {'code': code}).status_code == 200
        assert action(guest, code, 'start').status_code == 200
    guest.set_cookie('test_account', '1')
    assert guest.get('/api/golf/active').json['rooms'] == []
    assert guest.get('/api/golf/rooms/' + code).json['code'] == 'NOT_SEATED'
    guest.delete_cookie('test_account')
    assert state(guest, code)['mySeat'] == 0
    with app.app_context():
        assert Result.query.filter_by(user_id=1).count() == 0


def test_account_outage_leaves_the_guest_seat_available_for_transfer(app, lobby, monkeypatch):
    people, sockets, connect, code, runtime, advance, clock = lobby
    original = app.extensions['accounts'].cookie_user
    people[1].set_cookie('test_account', '2')

    def unavailable():
        raise AccountsUnavailable()

    monkeypatch.setattr(app.extensions['accounts'], 'cookie_user', unavailable)
    assert people[1].get('/api/golf/session').status_code == 503
    monkeypatch.setattr(app.extensions['accounts'], 'cookie_user', original)
    assert state(people[1], code)['mySeat'] == 1
    assert len(state(people[0], code)['seats']) == 3


@pytest.mark.parametrize('seat', [1, 2])
def test_disconnected_guest_and_account_lobby_seats_remain_until_explicit_leave(app, lobby, seat):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[seat].disconnect(namespace='/golf')
    advance(30 * 24 * 3600)
    assert len(state(people[0], code)['seats']) == 3
    assert post(people[seat], '/lobbies/join', {'code': code}).status_code == 200
    connect(people[seat])
    assert state(people[seat], code)['mySeat'] == seat
    assert len(state(people[0], code)['seats']) == 3
    with app.app_context():
        assert Result.query.count() == Event.query.count() == 0


def test_reconnecting_or_another_tab_cancels_lobby_cleanup(lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[1].disconnect(namespace='/golf')
    advance(59)
    replacement = connect(people[1])
    advance(2)
    assert len(state(people[0], code)['seats']) == 3
    connect(people[1])
    replacement.disconnect(namespace='/golf')
    advance(61)
    assert state(people[0], code)['seats'][1]['connected']
    assert len(state(people[0], code)['seats']) == 3


def test_disconnected_host_retains_membership_until_explicitly_leaving(lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[0].disconnect(namespace='/golf')
    advance(86400)
    assert state(people[0], code)['isHost']
    assert action(people[0], code, 'leave').status_code == 200
    value = state(people[1], code)
    assert value['isHost'] and value['mySeat'] == 0
    assert action(people[1], code, 'start').status_code == 200


def test_all_phones_can_sleep_and_only_the_last_explicit_departure_closes_lobby(app, lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    for socket in sockets[:]:
        socket.disconnect(namespace='/golf')
    advance(30 * 24 * 3600)
    for index, person in enumerate(people):
        connect(person)
        assert state(person, code)['mySeat'] == index
    for person in people[:-1]:
        assert action(person, code, 'leave').status_code == 200
        assert not state(people[-1], code)['closed']
    assert action(people[-1], code, 'leave').status_code == 200
    with app.app_context():
        assert db.session.get(Room, code).data['closed']
        assert Result.query.count() == Event.query.count() == 0


def test_another_departure_does_not_remove_a_sleeping_member(lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[2].disconnect(namespace='/golf')
    assert action(people[1], code, 'leave').status_code == 200
    advance(86400)
    assert len(state(people[0], code)['seats']) == 2
    connect(people[2])
    assert state(people[2], code)['mySeat'] == 1


@pytest.mark.parametrize('started', [False, True])
def test_connected_survivor_keeps_lobby_open_indefinitely_and_can_invite_again(app, lobby, started):
    people, sockets, connect, code, runtime, advance, clock = lobby
    if started:
        assert action(people[0], code, 'start').status_code == 200
    for person in people[1:]:
        assert action(person, code, 'leave').status_code == 200
    advance(120 if started else 60)
    value = state(people[0], code)
    assert not value['closed'] and value['stage'] == 'lobby'
    assert value['game'] is None and len(value['seats']) == 1
    assert value['capacity'] == 4
    # Server recovery must also preserve a lobby whose player is still online.
    runtime.recovered = False
    advance(30 * 24 * 60 * 60)
    assert state(people[0], code) == value
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['inactivityAt'] is None and data['lobbyDisconnectAt'] is None
    assert post(people[1], '/lobbies/join', {'code': code}).status_code == 200
    connect(people[1])
    assert action(people[0], code, 'start').status_code == 200
    assert state(people[0], code)['game'] is not None


def test_lobby_membership_does_not_require_subscribing_to_a_socket(lobby, clients):
    people, sockets, connect, code, runtime, advance, clock = lobby
    outsider = clients(4)
    assert post(outsider, '/lobbies/join', {'code': code}).status_code == 200
    advance(86400)
    assert len(state(people[0], code)['seats']) == 4
    connect(outsider)
    assert state(outsider, code)['mySeat'] == 3


def test_restart_clears_legacy_disconnect_deadlines_and_preserves_members(app, lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data['lobbyDisconnects'] = {'account:1': clock[0] - 1}
        data['lobbyDisconnectAt'] = clock[0] - 1
        row.data = data
        db.session.commit()
        runtime.connections.clear()
        runtime.recovered = False
    advance(86400)
    connect(people[0])
    assert state(people[0], code)['isHost']
    assert len(state(people[0], code)['seats']) == 3
    with app.app_context():
        assert db.session.get(Room, code).data['lobbyDisconnectAt'] is None


def test_starting_with_a_sleeping_member_gives_them_a_full_decision_deadline(lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[1].disconnect(namespace='/golf')
    advance(86400)
    assert action(people[0], code, 'start').status_code == 200
    advance(0)
    for person in (people[0], people[2]):
        for index in (0, 4):
            assert action(person, code, 'reveal', index=index).status_code == 200
    advance(540)
    assert len(state(people[0], code)['seats']) == 3
    assert state(people[1], code)['idleWarning']
    advance(60)
    assert len(state(people[0], code)['seats']) == 2
