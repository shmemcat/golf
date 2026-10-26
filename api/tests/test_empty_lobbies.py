"""Closing rooms never removes completed results or lets bots retain a group."""
import copy

import pytest

from golf_server.extensions import db
from golf_server.models import Room, Result
from test_golf import action, complete, create, post, state
from test_inactivity import online
from test_lobby_sessions import lobby


@pytest.mark.parametrize('departure', ['leave', 'disconnect'])
@pytest.mark.parametrize('finished', [False, True])
def test_last_human_closes_room_with_bots_and_keeps_results(app, online, departure, finished):
    people, sockets, connect, code, runtime, advance, clock = online
    if finished:
        complete(app, code, [-1000, 1000, 2000])
        with app.app_context():
            before = [(r.user_id, r.status, r.won, r.score, copy.deepcopy(r.detail)) for r in Result.query.order_by(Result.user_id)]
            assert all(r[1] == 'completed' for r in before)
    for index, person in enumerate(people):
        if departure == 'leave':
            assert action(person, code, 'leave').status_code == 200
        else:
            sockets[index].disconnect(namespace='/golf')
            advance(119)
            with app.app_context():
                assert not db.session.get(Room, code).data.get('closed')
            advance(1)
    if departure == 'disconnect':
        for person in people:
            connect(person)
            assert action(person, code, 'leave').status_code == 200
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['closed'] and data['stage'] == 'closed'
        assert data['next'] is None and data['motion'] is None
        assert data['inactivityAt'] is None and data['lobbyDisconnectAt'] is None
        assert any(p['isBot'] for p in data['seats'])
        if finished:
            after = [(r.user_id, r.status, r.won, r.score, r.detail) for r in Result.query.order_by(Result.user_id)]
            assert after == before
        else:
            assert all(r.status == 'abandoned' for r in Result.query)
    assert people[0].get('/api/golf/active').json['rooms'] == []
    assert post(people[0], '/lobbies/join', {'code': code}).json['code'] == 'LOBBY_CLOSED'


def test_finished_reconnect_cancels_cleanup_and_restart_recovers_it(app, online):
    people, sockets, connect, code, runtime, advance, clock = online
    complete(app, code)
    sockets[0].disconnect(namespace='/golf')
    advance(119)
    returned = connect(people[0])
    advance(1)
    assert not state(people[0], code)['seats'][0]['isBot']
    with app.app_context():
        runtime.connections.clear()
        runtime.recovered = False
    advance(0)
    advance(119)
    with app.app_context():
        assert not db.session.get(Room, code).data.get('closed')
    advance(1)
    with app.app_context():
        assert not db.session.get(Room, code).data.get('closed')
        assert all(r.status == 'completed' for r in Result.query)
    connect(people[0])
    assert state(people[0], code)['isHost']


def test_explicit_last_departure_closes_waiting_room_without_results(app, lobby):
    people, sockets, connect, code, runtime, advance, clock = lobby
    for person in people:
        assert action(person, code, 'leave').status_code == 200
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['closed'] and data['seats'] == []
        assert Result.query.count() == 0
    assert post(people[0], '/lobbies/join', {'code': code}).json['code'] == 'LOBBY_CLOSED'
