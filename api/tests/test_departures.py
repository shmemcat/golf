"""A multiplayer departure shrinks the table, including during an unfinished hole."""
import copy
import time

import pytest

from golf_server import engine
from golf_server.extensions import db
from golf_server.models import Room, Result
from test_golf import action, complete, create, post, state, tick
from test_hole_transition import finish_hole


@pytest.fixture
def table(app, clients):
    people = [clients(i) for i in (1, 2, 3)]
    code = create(people[0], 3, 'multiplayer')['code']
    for person in people[1:]:
        assert post(person, '/lobbies/join', {'code': code}).status_code == 200
    assert action(people[0], code, 'start').status_code == 200
    return people, code


def card_ids(game):
    cards = game['deck'] + game['discard'] + [c['card'] for p in game['players'] for c in p['cards']]
    if game['drawn']:
        cards.append(game['drawn']['card'])
    return [card['id'] for card in cards]


@pytest.mark.parametrize('seat', range(3))
@pytest.mark.parametrize('phase', ['dealing', 'opening', 'opponents', 'upcard', 'announcing',
                                  'draw', 'replace', 'draw-motion', 'discard', 'place', 'toss'])
def test_departure_preserves_boards_cards_and_resumes_every_phase(app, table, phase, seat):
    people, code = table
    with app.app_context():
        runtime = app.extensions['golf_runtime']
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        game = data['game']
        game.update(starter=seat, turn=seat)
        data.update(stage='opening', next=None, motion=None)
        if phase == 'dealing':
            data['stage'] = 'dealing'
            runtime.schedule(data, 'opening', 0)
        elif phase != 'opening':
            for index in range(3):
                engine.open_bot(game, index)
        if phase in ('opponents', 'upcard'):
            data['stage'] = 'opponents'
            runtime.schedule(data, 'upcard', 0)
            if phase == 'upcard':
                runtime.step(data, 'upcard')
        elif phase not in ('dealing', 'opening'):
            game['discard'].append(game['deck'].pop())
            game['phase'] = 'draw'
            data['stage'] = 'playing'
            if phase == 'announcing':
                data['stage'] = 'announcing'
                runtime.schedule(data, 'playing', 0)
            elif phase == 'draw-motion':
                runtime.begin_motion(data, 'draw', seat)
            elif phase in ('replace', 'discard', 'place', 'toss'):
                engine.draw(game, 'deck')
                if phase in ('discard', 'place', 'toss'):
                    runtime.begin_motion(data, 'toss' if phase == 'toss' else 'discard', seat, 0)
                    if phase == 'place':
                        runtime.step(data, 'arrival')
        game['history'] = [[10, 20, 30]]
        for index, player in enumerate(game['players']):
            player['score'] = (index + 1) * 10
        before = copy.deepcopy(game)
        runtime.save(row, data, 'test_setup')
    assert action(people[seat], code, 'leave').status_code == 200
    remaining = [person for index, person in enumerate(people) if index != seat]
    value = state(remaining[0], code)
    assert not value['closed'] and value['capacity'] == len(value['seats']) == 2
    assert not any(p['isBot'] for p in value['seats'])
    assert value['game']['history'] == [[score for index, score in enumerate([10, 20, 30]) if index != seat]]
    with app.app_context():
        data = db.session.get(Room, code).data
        after = data['game']
        assert after['players'] == [p for index, p in enumerate(before['players']) if index != seat]
        assert sorted(card_ids(after)) == sorted(card_ids(before))
        assert len(set(card_ids(after))) == 104
        assert Result.query.filter_by(user_id=seat + 1).one().status == 'abandoned'
    assert people[seat].get('/api/golf/rooms/' + code).json['code'] == 'NOT_SEATED'
    if phase in ('dealing', 'opening'):
        tick(app)
        assert state(remaining[0], code)['stage'] == 'opening'
    elif phase in ('opponents', 'upcard', 'announcing'):
        tick(app, 5)
        assert state(remaining[0], code)['stage'] == 'playing'
    else:
        assert value['game']['turn'] == seat % 2
        assert value['game']['phase'] == 'draw'
        assert value['motion'] is None
        next_person = remaining[value['game']['turn']]
        assert action(next_person, code, 'draw', source='deck').status_code == 200
        tick(app)
        assert state(next_person, code)['game']['phase'] == 'replace'


@pytest.mark.parametrize('kind', ['draw', 'discard', 'place', 'toss'])
def test_another_players_animation_finishes_after_a_preceding_seat_leaves(app, table, kind):
    people, code = table
    with app.app_context():
        runtime = app.extensions['golf_runtime']
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        game = data['game']
        game.update(phase='draw', turn=2)
        game['discard'].append(game['deck'].pop())
        data.update(stage='playing', next=None, motion=None)
        if kind != 'draw':
            engine.draw(game, 'deck')
        runtime.begin_motion(data, 'discard' if kind == 'place' else kind, 2, 4)
        if kind == 'place':
            runtime.step(data, 'arrival')
        runtime.save(row, data, 'test_setup')
    assert action(people[0], code, 'leave').status_code == 200
    motion = state(people[2], code)['motion']
    assert motion['seat'] == 1
    assert '2' not in motion['from'] and '2' not in motion['to']
    tick(app, 2 if kind == 'discard' else 1)
    value = state(people[2], code)
    assert value['motion'] is None
    assert value['game']['phase'] == ('replace' if kind == 'draw' else 'draw')
    with app.app_context():
        ids = card_ids(db.session.get(Room, code).data['game'])
        assert len(ids) == len(set(ids)) == 104


@pytest.mark.parametrize('seat', range(3))
def test_departure_while_reviewing_a_previous_hole_keeps_both_boards_aligned(app, table, seat):
    people, code = table
    finish_hole(app, code)
    assert action(people[2], code, 'advance').status_code == 200
    assert action(people[seat], code, 'leave').status_code == 200
    for index, person in enumerate(people):
        if index == seat:
            continue
        value = state(person, code)
        assert len(value['game']['players']) == len(value['seats']) == 2
        assert all(len(hole) == 2 for hole in value['game']['history'])
        if index != 2:
            assert value['game']['hole'] == 1
            assert action(person, code, 'advance').status_code == 200
        assert state(person, code)['game']['hole'] == 2


@pytest.mark.parametrize('started', [False, True])
@pytest.mark.parametrize('host_leaves', [False, True])
def test_two_player_departure_closes_with_notice_and_no_loss_for_survivor(app, clients, started, host_leaves):
    host, guest = clients(1), clients(2)
    code = create(host, 2, 'multiplayer')['code']
    post(guest, '/lobbies/join', {'code': code})
    if started:
        assert action(host, code, 'start').status_code == 200
    survivor, leaving = (guest, host) if host_leaves else (host, guest)
    socket = app.extensions['socketio'].test_client(app, namespace='/golf', flask_test_client=survivor,
                                                   auth={'csrf_token': survivor.golf_token})
    try:
        assert socket.emit('golf:subscribe', {'code': code}, namespace='/golf', callback=True)['ok']
        socket.get_received('/golf')
        assert action(leaving, code, 'leave').status_code == 200
        value = state(survivor, code)
        assert value['closed'] and value['stage'] == 'closed'
        assert value['closedReason'] == 'not_enough_players'
        assert len(value['seats']) == 1 and not value['seats'][0]['isBot']
        updates = [e['args'][0] for e in socket.get_received('/golf') if e['name'] == 'golf:state']
        assert updates[-1]['closedReason'] == 'not_enough_players'
        assert survivor.get('/api/golf/active').json['rooms'] == []
        assert post(survivor, '/lobbies/join', {'code': code}).json['code'] == 'LOBBY_CLOSED'
        stats = survivor.get('/api/golf/stats').json['statistics']['all_time']
        assert stats['games_played'] == stats['games_lost'] == stats['games_abandoned'] == 0
        assert survivor.get('/api/golf/results').json['results'] == []
        with app.app_context():
            data = db.session.get(Room, code).data
            assert data['next'] is None and data['motion'] is None
            assert data['inactivityAt'] is None and data['lobbyDisconnectAt'] is None
            assert not any(r.status == 'active' for r in Result.query)
    finally:
        socket.disconnect(namespace='/golf')


def test_removal_does_not_rewrite_completed_results(app, table):
    people, code = table
    complete(app, code)
    with app.app_context():
        before = [(r.user_id, r.status, r.won, r.score, copy.deepcopy(r.detail)) for r in Result.query.order_by(Result.user_id)]
    assert action(people[1], code, 'leave').status_code == 200
    assert action(people[2], code, 'leave').status_code == 200
    assert state(people[0], code)['closed']
    with app.app_context():
        assert [(r.user_id, r.status, r.won, r.score, r.detail) for r in Result.query.order_by(Result.user_id)] == before


@pytest.mark.parametrize('leaving', [0, 1, 2])
def test_final_turn_queue_and_going_out_penalty_survive_departure(leaving):
    game = engine.deal(3, starter=0)
    for player in game['players']:
        for index, cell in enumerate(player['cards']):
            cell['card']['rank'] = ('K', 'Q', 'J')[index % 3]
            cell['faceUp'] = True
    game.update(phase='draw', turn=1, finalTurns=[1, 2])
    engine.remove_player(game, leaving)
    while game['phase'] == 'draw':
        engine.draw(game, 'deck')
        engine.toss(game)
    assert game['phase'] == 'round-over'
    assert game['history'] == [[0, 0] if leaving == 0 else [10, 0]]


def test_departure_of_the_last_final_turn_scores_the_hole_once(app, table):
    people, code = table
    with app.app_context():
        runtime = app.extensions['golf_runtime']
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        game = data['game']
        game.update(phase='replace', turn=2, finalTurns=[2])
        game['drawn'] = {'card': game['deck'].pop(), 'source': 'deck'}
        data.update(stage='playing', motion=None, next=None)
        runtime.save(row, data, 'test_setup')
    assert action(people[2], code, 'leave').status_code == 200
    value = state(people[0], code)
    assert value['game']['phase'] == 'round-over'
    assert len(value['game']['history']) == 1
    assert len(value['game']['history'][0]) == 2
    tick(app, 5)
    assert state(people[0], code)['game'] == value['game']
    with app.app_context():
        ids = card_ids(db.session.get(Room, code).data['game'])
        assert len(ids) == len(set(ids)) == 104


def test_multiple_expired_seats_keep_identity_and_close_for_the_survivor(app, table, monkeypatch):
    people, code = table
    clock = [time.time()]
    monkeypatch.setattr('golf_server.runtime.time.time', lambda: clock[0])
    with app.app_context():
        runtime = app.extensions['golf_runtime']
        runtime.connections['survivor'] = (code, 'account:3')
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data.update(stage='opening', next=None, inactivity={})
        runtime.save(row, data, 'test_setup')
        clock[0] += 120
        runtime.tick(clock[0])
        data = db.session.get(Room, code).data
        assert [p['actor'] for p in data['seats']] == ['account:3']
        assert data['closed'] and data['closedReason'] == 'not_enough_players'
        assert data['removed'] == {'account:1': 'disconnected', 'account:2': 'disconnected'}
        assert Result.query.filter_by(user_id=1).one().status == 'abandoned'
        assert Result.query.filter_by(user_id=2).one().status == 'abandoned'
        assert Result.query.filter_by(user_id=3).one().status == 'cancelled'


def test_departure_does_not_restart_another_players_disconnect_deadline(app, table, monkeypatch):
    people, code = table
    clock = [time.time()]
    deadline = clock[0] + 120
    monkeypatch.setattr('golf_server.runtime.time.time', lambda: clock[0])
    with app.app_context():
        runtime = app.extensions['golf_runtime']
        runtime.connections['survivor'] = (code, 'account:3')
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data.update(stage='opening', next=None, inactivity={})
        runtime.save(row, data, 'test_setup')
    clock[0] += 60
    assert action(people[0], code, 'leave').status_code == 200
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['inactivity']['0']['at'] == deadline
        clock[0] = deadline
        runtime.tick(clock[0])
    assert state(people[2], code)['closedReason'] == 'not_enough_players'
