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
def test_disconnected_guest_and_account_lobby_seats_expire_after_sixty_seconds(app, lobby, seat):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[seat].disconnect(namespace='/golf')
    advance(59)
    assert len(state(people[0], code)['seats']) == 3
    advance(1)
    value = state(people[0], code)
    assert len(value['seats']) == 2
    assert value['capacity'] == 4
    assert value['game'] is None
    assert people[seat].get('/api/golf/rooms/' + code).json['code'] == 'NOT_SEATED'
    assert post(people[seat], '/lobbies/join', {'code': code}).status_code == 200
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


def test_expired_host_passes_hosting_to_the_next_player(lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[0].disconnect(namespace='/golf')
    advance(60)
    value = state(people[1], code)
    assert value['isHost'] and value['mySeat'] == 0
    assert len(value['seats']) == 2
    assert action(people[1], code, 'start').status_code == 200


def test_multiple_expired_seats_close_an_empty_lobby_without_results(app, lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    for socket in sockets:
        socket.disconnect(namespace='/golf')
    advance(60)
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['seats'] == []
        assert data['closed']
        assert data['lobbyDisconnectAt'] is None
        assert Result.query.count() == Event.query.count() == 0
    assert post(people[0], '/lobbies/join', {'code': code}).json['code'] == 'LOBBY_CLOSED'


def test_other_seat_changes_do_not_restart_a_disconnected_players_grace_period(lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[2].disconnect(namespace='/golf')
    advance(30)
    assert action(people[1], code, 'leave').status_code == 200
    advance(29)
    assert len(state(people[0], code)['seats']) == 2
    advance(1)
    assert len(state(people[0], code)['seats']) == 1


def test_lobby_join_that_never_subscribes_also_expires(lobby, clients):
    people, sockets, connect, code, runtime, advance, clock = lobby
    outsider = clients(4)
    assert post(outsider, '/lobbies/join', {'code': code}).status_code == 200
    advance(60)
    assert len(state(people[0], code)['seats']) == 3
    assert outsider.get('/api/golf/rooms/' + code).json['code'] == 'NOT_SEATED'


def test_restart_recovers_legacy_waiting_lobbies_and_allows_reconnect(app, lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data.pop('lobbyDisconnects', None)
        data.pop('lobbyDisconnectAt', None)
        row.data = data
        db.session.commit()
        runtime.connections.clear()
        runtime.recovered = False
    advance(0)
    advance(59)
    connect(people[0])
    advance(1)
    value = state(people[0], code)
    assert value['isHost']
    assert len(value['seats']) == 1


def test_starting_a_game_replaces_the_lobby_deadline_with_the_game_deadline(lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    sockets[1].disconnect(namespace='/golf')
    advance(59)
    assert action(people[0], code, 'start').status_code == 200
    advance(1)
    assert not state(people[0], code)['seats'][1]['isBot']
    advance(118)
    assert not state(people[0], code)['seats'][1]['isBot']
    advance(1)
    value = state(people[0], code)
    assert len(value['seats']) == len(value['game']['players']) == 2
    assert not any(p['isBot'] for p in value['seats'])
