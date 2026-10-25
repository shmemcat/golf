import copy
import time
import uuid
from datetime import datetime, timedelta
import pytest
from golf_server import engine
from golf_server.application import create_app
from golf_server.extensions import db
from golf_server.models import Room, Result, Event
from golf_server.statistics import save_results


def post(client, path, payload):
    return client.post('/api/golf' + path, json=payload, headers=client.golf_headers)


def create(client, count=2, mode='bot', rid=None):
    response = post(client, '/bots' if mode == 'bot' else '/lobbies', {'players': count, 'requestId': rid or str(uuid.uuid4())})
    assert response.status_code == 200, response.json
    return response.json['state']


def state(client, code):
    return client.get('/api/golf/rooms/' + code).json['state']


def action(client, code, verb, **detail):
    return post(client, f'/rooms/{code}/actions', {'action': verb, 'actionId': str(uuid.uuid4()), 'revision': state(client, code)['revision'], **detail})


def tick(app, count=1):
    with app.app_context():
        for _ in range(count):
            app.extensions['golf_runtime'].tick(time.time())


def playing(app, client, code):
    for _ in range(8):
        tick(app)
        value = state(client, code)
        if value['stage'] == 'playing' and not value['motion']:
            return value
    raise AssertionError('Table did not start')


@pytest.mark.parametrize('count', range(2, 7))
def test_nine_hole_engine_card_conservation_and_end(count):
    game = engine.deal(count)
    game_id = game['id']
    for hole in range(1, 10):
        assert game['hole'] == hole
        assert game['id'] == game_id
        for seat in range(count):
            engine.open_bot(game, seat)
            opened = [i for i, c in enumerate(game['players'][seat]['cards']) if c['faceUp']]
            assert len(opened) == len({i % 3 for i in opened}) == 2
            assert {i // 3 for i in opened} == {0, 1}
        game['discard'].append(game['deck'].pop())
        game['phase'] = 'draw'
        for turn in range(2000):
            engine.draw(game, engine.bot_source(game))
            index = engine.replacement_index(game, game['drawn']['card'], game['drawn']['source'] == 'discard')
            engine.toss(game) if index < 0 else engine.replace(game, index)
            cards = game['deck'] + game['discard'] + [c['card'] for p in game['players'] for c in p['cards']]
            assert len(cards) == len({c['id'] for c in cards}) == 104
            if game['phase'] in ('round-over', 'game-over'):
                break
        else:
            pytest.fail('Bot game stalled')
        assert len(game['history']) == hole
        assert all(p['score'] == sum(h[seat] for h in game['history']) for seat, p in enumerate(game['players']))
        if hole < 9:
            game = engine.next_hole(game)
    assert game['phase'] == 'game-over'


def test_scoring_pairs_block_and_bot_cannot_read_hidden():
    def cards(ranks):
        return [{'faceUp': True, 'card': {'id': str(i), 'rank': r, 'suit': 'S'}} for i, r in enumerate(ranks)]
    assert engine.score_grid(cards(['9', '9', 'A', '9', '9', '2'])) == -21
    assert engine.score_grid(cards(['K', '2', 'Q', 'K', '2', 'Q'])) == -4
    game = engine.deal(2)
    game['players'][game['turn']]['cards'] = [{'faceUp': False, 'card': {'id': str(i)}} for i in range(6)]
    assert 0 <= engine.replacement_index(game, {'rank': '2'}) < 6
    assert engine.replacement_index(game, {'rank': 'Q'}) == -1


def grid(ranks):
    return [{'faceUp': i != 5, 'card': {'id': str(i), 'rank': rank, 'suit': 'S'}} for i, rank in enumerate(ranks)]


@pytest.mark.parametrize('seat', range(6))
@pytest.mark.parametrize('first', range(6))
def test_opening_requires_opposite_rows_and_different_columns(seat, first):
    game = engine.deal(6)
    engine.reveal(game, seat, first)
    for index in range(6):
        candidate = copy.deepcopy(game)
        legal = index // 3 != first // 3 and index % 3 != first % 3
        assert engine.can_open(candidate, seat, index) == legal
        if legal:
            engine.reveal(candidate, seat, index)
            assert sum(c['faceUp'] for c in candidate['players'][seat]['cards']) == 2
            assert not any(engine.can_open(candidate, seat, i) for i in range(6))
        else:
            with pytest.raises(ValueError, match='one starting card in each row'):
                engine.reveal(candidate, seat, index)
            assert candidate == game


@pytest.mark.parametrize('first', [None, *range(6)])
def test_bot_opening_respects_rows_and_columns_and_preserves_first_choice(first):
    game = engine.deal(2)
    if first is not None:
        engine.reveal(game, 1, first)
    engine.open_bot(game, 1)
    opened = [i for i, c in enumerate(game['players'][1]['cards']) if c['faceUp']]
    assert len(opened) == len({i % 3 for i in opened}) == 2
    assert {i // 3 for i in opened} == {0, 1}
    assert first is None or first in opened
    before = copy.deepcopy(game)
    engine.open_bot(game, 1)
    assert game == before


@pytest.mark.parametrize('column', range(3))
def test_paired_twos_score_negative_four_in_each_column(column):
    cards = grid(['K', 'A', 'Q', 'K', 'A', 'Q'])
    cards[column]['card']['rank'] = cards[column + 3]['card']['rank'] = '2'
    assert engine.score_grid(cards) == -4


@pytest.mark.parametrize('ranks,score', [
    (['2', 'A', 'K', '2', '3', 'Q'], 10),
    (['2', 'K', '2', '2', 'K', '2'], -8),
    (['2', '2', 'K', '2', '2', 'K'], -28),
    (['K', '2', '2', 'K', '2', '2'], -28),
    (['2', '2', 'K', '2', '2', '3'], -25),
    (['2', '2', '2', '2', '2', '2'], -32),
])
def test_twos_scoring_with_pairs_and_blocks(ranks, score):
    assert engine.score_grid(grid(ranks)) == score


@pytest.mark.parametrize('ranks', [
    ['2', '2', 'K', '2', '2', 'K'],
    ['K', '2', '2', 'K', '2', '2'],
])
def test_bot_values_a_visible_twos_block_as_negative_twenty_eight(ranks):
    game = engine.deal(2)
    cards = grid(ranks)
    for cell in cards:
        cell['faceUp'] = True
    game['players'][game['turn']]['cards'] = cards
    king = {'id': 'test-king', 'rank': 'K', 'suit': 'H'}
    game['discard'] = [king]
    assert engine.grid_value(cards) == -28
    assert engine.replacement_index(game, king) == -1
    assert engine.bot_source(game) == 'deck'


def test_bot_completes_and_preserves_paired_twos():
    game = engine.deal(2)
    cards = grid(['2', 'A', '3', 'K', 'A', '3'])
    for cell in cards:
        cell['faceUp'] = True
    game['players'][game['turn']]['cards'] = cards
    two = {'id': 'test-two', 'rank': '2', 'suit': 'H'}
    game['discard'] = [two]
    assert engine.replacement_index(game, two) == 3
    assert engine.bot_source(game) == 'discard'

    cards[3]['card'] = two
    king = {'id': 'test-king', 'rank': 'K', 'suit': 'H'}
    game['discard'] = [king]
    assert engine.replacement_index(game, king) == -1
    assert engine.bot_source(game) == 'deck'


@pytest.mark.parametrize('count,went_out', [(count, seat) for count in range(2, 7) for seat in range(count)])
@pytest.mark.parametrize('hole', [1, 9])
def test_going_out_penalty_after_last_turn_for_every_seat(count, went_out, hole):
    previous = [-20 if seat == went_out else 40 for seat in range(count)]
    game = engine.deal(count, hole=hole, scores=[score * (hole - 1) for score in previous],
                       history=[previous[:] for _ in range(hole - 1)])
    game.update(phase='draw', turn=went_out, discard=[{'id': 'out-draw', 'rank': 'Q', 'suit': 'H'}])
    for seat, player in enumerate(game['players']):
        player['cards'] = grid(['J', 'Q', 'J', 'Q', 'J', 'Q'] if seat == went_out else ['K', 'A', '3', 'K', 'A', '3'])
    totals = [p['score'] for p in game['players']]
    engine.draw(game, 'discard')
    engine.replace(game, 5)
    for i in range(1, count):
        assert game['turn'] == (went_out + i) % count
        assert len(game['history']) == hole - 1
        assert [p['score'] for p in game['players']] == totals
        engine.draw(game, 'deck')
        engine.toss(game)
    scores = [70 if seat == went_out else 0 for seat in range(count)]
    assert game['phase'] == ('game-over' if hole == 9 else 'round-over')
    assert len(game['history']) == hole
    assert game['history'][-1] == scores
    assert [p['score'] for p in game['players']] == [total + score for total, score in zip(totals, scores)]
    snapshot = copy.deepcopy(game)
    with pytest.raises(ValueError):
        engine.toss(game)
    with pytest.raises(ValueError):
        engine.replace(game, 5)
    assert game == snapshot
    if hole == 1:
        following = engine.next_hole(game)
        assert [p['score'] for p in following['players']] == scores
        assert following['finalTurns'] is None


@pytest.mark.parametrize('out,other,penalty', [
    (['K', 'A', '3', 'K', 'A', '3'], ['K', 'A', '3', 'K', 'A', '4'], 0),
    (['K', 'A', '3', 'K', 'A', '4'], ['K', 'A', '3', 'K', 'A', '4'], 0),
    (['8', '8', 'K', '8', '8', 'K'], ['8', '8', '2', '8', '8', 'A'], 10),
    (['8', '8', '2', '8', '8', 'A'], ['8', '8', 'K', '8', '8', 'K'], 0),
])
def test_going_out_compares_hole_scores_including_ties_and_negatives(out, other, penalty):
    game = engine.deal(3)
    game.update(phase='draw', turn=1, discard=[{'id': 'out-draw', 'rank': out[5], 'suit': 'H'}])
    for seat, player in enumerate(game['players']):
        player['cards'] = grid(out if seat == 1 else other)
    engine.draw(game, 'discard')
    engine.replace(game, 5)
    for _ in range(2):
        engine.draw(game, 'deck')
        engine.toss(game)
    assert game['history'][0] == [engine.score_grid(grid(other)), engine.score_grid(grid(out)) + penalty, engine.score_grid(grid(other))]


def test_lower_score_on_last_turn_after_another_player_also_exposes_all_cards():
    game = engine.deal(3)
    game.update(phase='draw', turn=0, discard=[{'id': 'out-draw', 'rank': 'K', 'suit': 'H'}])
    for player in game['players']:
        player['cards'] = grid(['8', '8', 'A', '8', '8', 'K'])
    engine.draw(game, 'discard')
    engine.replace(game, 5)
    assert game['finalTurns'] == [1, 2]
    engine.draw(game, 'discard')
    engine.replace(game, 5)
    assert game['finalTurns'] == [2]
    assert game['history'] == []
    assert all(p['score'] == 0 for p in game['players'])
    game['deck'].append({'id': 'last-draw', 'rank': '2', 'suit': 'D'})
    engine.draw(game, 'deck')
    engine.replace(game, 5)
    assert game['history'][0] == [-9, -19, -21]


def test_privacy_idempotent_create_and_guardrails(app, clients):
    client, outsider = clients(1), clients(2)
    value = create(client, 6, rid='same-create-request')
    assert create(client, 6, rid='same-create-request') == value
    assert value['game']['deckCount'] == 68
    assert 'deck' not in value['game']
    assert all(set(c['card']) == {'id'} for p in value['game']['players'] for c in p['cards'])
    assert all(set(p) == {'name', 'profileIcon', 'isBot', 'connected'} for p in value['seats'])
    assert outsider.get('/api/golf/rooms/' + value['code']).status_code == 403
    assert client.post('/api/golf/bots', json={'players': 2}).status_code == 403
    assert client.post('/api/golf/bots', json={}, headers={**client.golf_headers, 'Origin': 'https://evil.example'}).status_code == 403
    for count in (1, 7, True, '3'):
        assert post(client, '/bots', {'players': count, 'requestId': str(uuid.uuid4())}).status_code == 400


@pytest.mark.parametrize('count', range(2, 7))
def test_multiplayer_join_capacity_host_and_opening(app, clients, count):
    people = [clients(i + 1) for i in range(count)]
    value = create(people[0], count, 'multiplayer')
    code = value['code']
    for i, person in enumerate(people[1:], 1):
        joined = post(person, '/lobbies/join', {'code': code}).json['state']
        assert joined['mySeat'] == i
        assert post(person, '/lobbies/join', {'code': code}).json['state']['mySeat'] == i
    assert post(clients(99), '/lobbies/join', {'code': code}).status_code == 400
    assert action(people[-1], code, 'start').status_code == 400
    assert action(people[0], code, 'start').status_code == 200
    tick(app)
    for person in people:
        assert action(person, code, 'reveal', index=0).status_code == 200
        assert action(person, code, 'reveal', index=3).status_code == 400
        assert action(person, code, 'reveal', index=1).status_code == 400
        assert action(person, code, 'reveal', index=4).status_code == 200
    assert state(people[0], code)['stage'] == 'opponents'
    tick(app, 3)
    assert state(people[0], code)['stage'] == 'playing'


def test_socket_is_separate_reconnects_rejects_wrong_auth_and_revoked_account(app, clients):
    person, stranger = clients(1), clients(2)
    value = create(person)
    socketio = app.extensions['socketio']
    options = dict(namespace='/golf', headers={'Origin': 'http://localhost:3003'}, flask_test_client=person, auth={'csrf_token': person.golf_token})
    socket = socketio.test_client(app, **options)
    assert socket.is_connected('/golf')
    assert not socket.is_connected('/hearts') and not socket.is_connected('/euchre') and not socket.is_connected('/')
    reply = socket.emit('golf:subscribe', {'code': value['code']}, namespace='/golf', callback=True)
    assert reply['ok']
    assert socket.get_received('/golf')[0]['name'] == 'golf:state'
    tick(app)
    assert socket.get_received('/golf')[-1]['args'][0]['stage'] == 'opening'
    payload = {'code': value['code'], 'revision': state(person, value['code'])['revision'], 'actionId': str(uuid.uuid4()), 'action': 'reveal', 'index': 0, 'seat': 1, 'scores': [-9999, 9999]}
    assert socket.emit('golf:action', payload, namespace='/golf', callback=True)['ok']
    app.extensions['accounts'].revoked.add(1)
    payload.update(actionId=str(uuid.uuid4()), revision=3, index=1)
    assert not socket.emit('golf:action', payload, namespace='/golf', callback=True)['ok']
    socket.disconnect(namespace='/golf')
    denied = socketio.test_client(app, **{**options, 'auth': {'csrf_token': 'wrong'}})
    assert not denied.is_connected('/golf')
    denied = socketio.test_client(app, **{**options, 'headers': {'Origin': 'https://evil.example'}})
    assert not denied.is_connected('/golf')
    same_origin_poll = socketio.test_client(app, **{**options, 'headers': {}})
    assert same_origin_poll.is_connected('/golf')
    same_origin_poll.disconnect(namespace='/golf')


def test_actions_exactly_once_stale_revision_and_wrong_turn(app, clients):
    client = clients(1)
    value = create(client)
    code = value['code']
    tick(app)
    payload = {'revision': state(client, code)['revision'], 'actionId': 'unique-action-123', 'action': 'reveal', 'index': 0}
    first = post(client, f'/rooms/{code}/actions', payload)
    repeated = post(client, f'/rooms/{code}/actions', payload)
    assert repeated.json == first.json
    assert post(client, f'/rooms/{code}/actions', {**payload, 'actionId': 'different-action', 'index': 1}).status_code == 409
    assert action(client, code, 'reveal', index=True).status_code == 400
    assert action(client, code, 'reveal', index=4).status_code == 200
    value = playing(app, client, code)
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data); data['game']['turn'] = 1; data['game']['phase'] = 'draw'; data['motion'] = None
        row.data = data; db.session.commit()
    assert action(client, code, 'draw', source='deck').status_code == 400
    with app.app_context():
        row = db.session.get(Room, code); data = copy.deepcopy(row.data); data['game']['turn'] = 0
        engine.draw(data['game'], 'discard'); row.data = data; db.session.commit()
    assert action(client, code, 'toss').status_code == 400


def complete(app, code, winner_scores=None):
    # Set up a final turn; the actual command clock owns final scoring and records.
    with app.app_context():
        row = db.session.get(Room, code); data = copy.deepcopy(row.data); game = data['game']
        for person in game['players']:
            for card in person['cards']:
                card['faceUp'] = True
        game.update(hole=9, phase='replace', drawn={'card': game['deck'].pop(), 'source': 'deck'}, finalTurns=[game['turn']], history=[[0] * len(game['players']) for _ in range(8)])
        if winner_scores:
            for p, score in zip(game['players'], winner_scores): p['score'] = score
        data.update(stage='playing', next={'kind': 'arrival', 'at': 0}, motion={'kind': 'toss', 'seat': game['turn']})
        row.data = data; db.session.commit()
    tick(app)


def test_results_are_account_owned_once_separated_global_and_durable(app, clients):
    a, b, guest = clients(1), clients(2), clients()
    bot = create(a); complete(app, bot['code'], [-1000, 1000])
    lobby = create(a, 3, 'multiplayer'); code = lobby['code']
    post(b, '/lobbies/join', {'code': code}); post(guest, '/lobbies/join', {'code': code})
    action(a, code, 'start'); complete(app, code, [-1000, 1000, 2000])
    with app.app_context():
        data = db.session.get(Room, code).data
        save_results(data, terminal=True); db.session.commit()
        assert Result.query.count() == 3
        assert Event.query.filter_by(game_id=data['game']['id'], kind='arrival').count() == 1
        assert set(db.inspect(db.engine).get_table_names()) == {'golf_rooms', 'golf_results', 'golf_events', 'golf_deleted_users', 'golf_schema_version'}
    own = a.get('/api/golf/stats?user_id=2').json['statistics']
    assert own['all_time']['games_played'] == 2 and own['all_time']['games_won'] == 2
    assert own['bot']['games_played'] == own['multiplayer']['games_played'] == 1
    assert b.get('/api/golf/stats').json['statistics']['all_time']['games_won'] == 0
    assert guest.get('/api/golf/stats').status_code == 401
    assert a.get('/api/golf/results').json['results'][0]['holes'] is not None
    for mode in ['bot', 'multiplayer']:
        data = guest.get('/api/golf/leaderboard?mode=' + mode).json
        assert data['monthly'][0]['username'] == 'Player 1'
        assert data['all_time'][0]['games_won'] == 1
    # Recreate the service against the same file; room and records survive.
    recreated = create_app({**app.config, 'START_GOLF_WORKER': False}, accounts=app.extensions['accounts'])
    with recreated.app_context():
        assert Result.query.count() == 3
        assert db.session.get(Room, code).data['game']['phase'] == 'game-over'
        db.session.remove(); db.engine.dispose()


def test_monthly_rankings_and_deletion_no_resurrection(app, clients):
    person = clients(1); value = create(person); code = value['code']; complete(app, code, [-1000, 1000])
    with app.app_context():
        row = Result.query.one(); row.completed_at = datetime.utcnow().replace(day=1) - timedelta(days=1); db.session.commit()
    data = person.get('/api/golf/leaderboard?mode=bot').json
    assert data['monthly'] == [] and len(data['all_time']) == 1
    path = '/_internal/games/v1/golf/delete-user'
    payload = {'user_id': 1, 'request_id': 'request-123'}
    assert person.post(path, json=payload).status_code == 401
    headers = {'Authorization': 'Bearer ' + 'deletion-token-' * 4, 'X-Cards-Service': 'accounts'}
    assert person.post(path, json=payload, headers=headers).json['deleted']
    assert person.post(path, json=payload, headers=headers).json['deleted']
    with app.app_context():
        row = db.session.get(Room, code); assert 'account:1' not in str(row.data)
        save_results(row.data, terminal=True); db.session.commit(); assert Result.query.count() == 0
    assert person.get('/api/golf/stats').status_code == 401
    assert clients().get('/api/golf/leaderboard').json['all_time'] == []


def test_fill_bots_leave_host_transfer_and_readiness(app, clients):
    a, b = clients(1), clients(2)
    value = create(a, 4, 'multiplayer'); code = value['code']
    assert action(a, code, 'start', fillBots=True).status_code == 400
    post(b, '/lobbies/join', {'code': code})
    assert action(a, code, 'start', fillBots=True).status_code == 200
    assert sum(p['isBot'] for p in state(a, code)['seats']) == 2
    complete(app, code)
    assert action(a, code, 'restart').status_code == 200
    assert state(a, code)['game']['phase'] == 'game-over'
    assert action(b, code, 'restart').status_code == 200
    assert state(a, code)['game']['phase'] == 'opening'
    assert action(a, code, 'leave').status_code == 200
    assert a.get('/api/golf/stats').json['statistics']['all_time']['games_abandoned'] == 1
    assert state(b, code)['seats'][0]['isBot']
    empty = create(a, 2, 'multiplayer')['code']
    assert action(a, empty, 'leave').status_code == 200
    post(b, '/lobbies/join', {'code': empty})
    assert state(b, empty)['isHost']


@pytest.mark.parametrize('uid', [None, 1])
@pytest.mark.parametrize('count', range(2, 7))
def test_single_player_waits_for_both_starting_card_choices(app, clients, uid, count):
    person = clients(uid); code = create(person, count)['code']
    tick(app)
    for index in (5, 0):
        waiting = state(person, code)
        assert waiting['stage'] == 'opening'
        tick(app, 3)
        assert state(person, code) == waiting
        assert action(person, code, 'reveal', index=index).status_code == 200
    assert state(person, code)['stage'] == 'opponents'
    assert playing(app, person, code)['stage'] == 'playing'


def test_single_player_waits_for_draw_replacement_and_next_hole_while_bots_play(app, clients):
    person = clients(1); code = create(person)['code']
    with app.app_context():
        row = db.session.get(Room, code); data = copy.deepcopy(row.data)
        data['game'].update(starter=0, turn=0)
        row.data = data; db.session.commit()
    tick(app)
    for index in (0, 4):
        assert action(person, code, 'reveal', index=index).status_code == 200
    playing(app, person, code)

    for phase, verb, detail in [('draw', 'draw', {'source': 'deck'}), ('replace', 'replace', {'index': 2})]:
        waiting = state(person, code)
        assert waiting['game']['phase'] == phase and waiting['game']['turn'] == 0
        tick(app, 3)
        assert state(person, code) == waiting
        assert action(person, code, verb, **detail).status_code == 200
        tick(app, 1 if verb == 'draw' else 2)

    for _ in range(10):
        tick(app)
        value = state(person, code)
        if value['game']['turn'] == 0 and not value['motion']:
            break
    else:
        pytest.fail('Bot did not return the turn to the player')
    with app.app_context():
        row = db.session.get(Room, code); data = copy.deepcopy(row.data)
        bot = data['metrics'][1]
        assert bot.get('deck_draws', 0) + bot.get('discard_draws', 0) == 1
        # Finish the hole through the normal command and animation path.
        data['game']['finalTurns'] = [0]
        for player in data['game']['players']:
            for cell in player['cards']:
                cell['faceUp'] = True
        row.data = data; db.session.commit()
    assert action(person, code, 'draw', source='deck').status_code == 200
    tick(app)
    assert action(person, code, 'toss').status_code == 200
    tick(app)
    waiting = state(person, code)
    assert waiting['game']['phase'] == 'round-over'
    tick(app, 3)
    assert state(person, code) == waiting
    assert action(person, code, 'advance').status_code == 200
    tick(app)
    value = state(person, code)
    assert value['game']['hole'] == 2 and value['stage'] == 'opening'
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['next'] is None
        assert data['metrics'][0].get('autoplay_turns', 0) == 0


@pytest.mark.parametrize('kind,phase', [
    ('opening_timeout', 'opening'), ('turn_timeout', 'draw'),
    ('turn_timeout', 'replace'), ('round_timeout', 'round-over'),
])
def test_saved_single_player_timeouts_do_not_act_after_restart(app, clients, kind, phase):
    person = clients(1); code = create(person)['code']
    with app.app_context():
        row = db.session.get(Room, code); data = copy.deepcopy(row.data); game = data['game']
        if phase == 'opening':
            engine.reveal(game, 0, 5)
        else:
            for seat in range(len(data['seats'])):
                engine.open_bot(game, seat)
            game['discard'].append(game['deck'].pop())
            game.update(phase='draw', turn=0)
            if phase == 'replace':
                engine.draw(game, 'deck')
            game['phase'] = phase
        data.update(stage='opening' if phase == 'opening' else 'playing', next={'kind': kind, 'at': 0})
        row.data = data; db.session.commit()
    waiting = state(person, code)
    recreated = create_app({**app.config, 'START_GOLF_WORKER': False}, accounts=app.extensions['accounts'])
    try:
        tick(recreated, 3)
        value = state(person, code)
        assert value == {**waiting, 'revision': waiting['revision'] + 1}
        with recreated.app_context():
            data = db.session.get(Room, code).data
            assert data['next'] is None
            assert data['metrics'][0].get('autoplay_turns', 0) == 0
    finally:
        with recreated.app_context():
            db.session.remove(); db.engine.dispose()


def test_multiplayer_durable_clock_completes_nine_holes_and_logs_actual_counters(app, clients):
    person, friend = clients(1), clients(2)
    code = create(person, 3, 'multiplayer')['code']
    assert post(friend, '/lobbies/join', {'code': code}).status_code == 200
    assert action(person, code, 'start', fillBots=True).status_code == 200
    with app.app_context():
        runtime = app.extensions['golf_runtime']
        actors = [{'key': f'account:{i}', 'user': app.extensions['accounts'].identity(i)} for i in (1, 2)]
        runtime.connections.update({f'test-{i}': (code, a['key']) for i, a in enumerate(actors)})
        for _ in range(10000):
            runtime.tick(time.time())
            row = db.session.get(Room, code)
            data, game = row.data, row.data['game']
            if game['phase'] == 'game-over':
                break
            decisions = []
            if data['stage'] == 'opening':
                for seat in (0, 1):
                    opened = [i for i, c in enumerate(game['players'][seat]['cards']) if c['faceUp']]
                    if len(opened) < 2:
                        index = next(i for i in range(6) if engine.can_open(game, seat, i))
                        decisions.append((seat, dict(action='reveal', index=index)))
            elif game['phase'] == 'round-over':
                decisions = [(seat, dict(action='advance')) for seat in (0, 1) if seat not in data['ready']]
            elif data['stage'] == 'playing' and not data['motion'] and game['turn'] in (0, 1):
                seat = game['turn']
                if game['phase'] == 'draw':
                    decisions = [(seat, dict(action='draw', source=engine.bot_source(game)))]
                elif game['phase'] == 'replace':
                    index = engine.replacement_index(game, game['drawn']['card'], game['drawn']['source'] == 'discard')
                    decisions = [(seat, dict(action='toss') if index < 0 else dict(action='replace', index=index))]
            for seat, decision in decisions:
                revision = db.session.get(Room, code).data['revision']
                runtime.command(actors[seat], code, dict(**decision, revision=revision, actionId=str(uuid.uuid4())))
        else:
            pytest.fail('Server clock did not complete nine holes')
        result = Result.query.filter_by(user_id=1).one()
        assert result.status == 'completed'
        assert len(result.detail['holes']) == 9
        assert sum(result.detail['holes']) == result.score
        assert result.detail['deck_draws'] + result.detail['discard_draws'] > 0
        assert result.detail['replacements'] + result.detail['discarded_draws'] == result.detail['deck_draws'] + result.detail['discard_draws']
        assert 18 <= result.detail['cards_revealed'] <= 54
        assert result.detail['autoplay_turns'] == 0
        completed_events = Event.query.count()
        runtime.tick(float('inf'))
        assert Event.query.count() == completed_events
    summary = person.get('/api/golf/stats').json['statistics']['multiplayer']
    assert summary['games_completed'] == 1 and summary['holes_played'] == 9


def test_shared_wins_are_credited_to_each_account_and_guest_scores_cannot_be_uploaded(app, clients):
    a, b = clients(1), clients(2)
    code = create(a, 2, 'multiplayer')['code']; post(b, '/lobbies/join', {'code': code}); action(a, code, 'start')
    with app.app_context():
        row = db.session.get(Room, code); data = copy.deepcopy(row.data)
        for player in data['game']['players']:
            for cell in player['cards']:
                cell['card']['rank'] = 'K'
        row.data = data; db.session.commit()
    complete(app, code)
    for person in (a, b):
        stats = person.get('/api/golf/stats').json['statistics']['multiplayer']
        assert stats['games_won'] == stats['shared_wins'] == 1
    assert len(a.get('/api/golf/leaderboard?mode=multiplayer').json['all_time']) == 2
    assert post(a, '/results', {'score': -9999, 'won': True}).status_code == 405


def test_discard_stays_visible_during_placement_but_other_hidden_cards_stay_private(app, clients):
    person = clients(1); code = create(person)['code']
    tick(app)
    assert action(person, code, 'reveal', index=0).status_code == 200
    assert action(person, code, 'reveal', index=4).status_code == 200
    playing(app, person, code)
    with app.app_context():
        row = db.session.get(Room, code); data = copy.deepcopy(row.data)
        data['game']['turn'] = 0; data['game']['phase'] = 'draw'; data['motion'] = None; data['next'] = None
        index = next(i for i, c in enumerate(data['game']['players'][0]['cards']) if not c['faceUp'])
        old_card = data['game']['players'][0]['cards'][index]['card']
        row.data = data; db.session.commit()
    assert action(person, code, 'draw', source='deck').status_code == 200
    tick(app)
    assert action(person, code, 'replace', index=index).status_code == 200
    assert state(person, code)['motion']['card'] == old_card
    tick(app)
    value = state(person, code)
    assert value['motion']['kind'] == 'place'
    assert value['game']['players'][0]['cards'][index]['card'] == old_card
    for seat, player in enumerate(value['game']['players']):
        for i, card in enumerate(player['cards']):
            if not card['faceUp'] and (seat, i) != (0, index):
                assert set(card['card']) == {'id'}
    tick(app)
    value = state(person, code)
    assert value['game']['discard'][-1] == old_card


@pytest.mark.parametrize('leave_first', [True, False])
def test_departed_players_do_not_get_new_results_in_other_players_rematches(app, clients, leave_first):
    a, b, c = clients(1), clients(2), clients(3)
    code = create(a, 3, 'multiplayer')['code']
    post(b, '/lobbies/join', {'code': code}); post(c, '/lobbies/join', {'code': code})
    action(a, code, 'start'); complete(app, code)
    if leave_first:
        assert action(c, code, 'leave').status_code == 200
    assert action(a, code, 'restart').status_code == 200
    assert action(b, code, 'restart').status_code == 200
    if not leave_first:
        assert state(a, code)['game']['phase'] == 'game-over'
        assert action(c, code, 'leave').status_code == 200
    assert state(a, code)['game']['phase'] == 'opening'
    assert state(a, code)['seats'][2]['isBot']
    assert state(a, code)['seats'][2]['name'] == 'Clover'
    with app.app_context():
        data = db.session.get(Room, code).data
        assert data['humanCount'] == 2
        assert 'account:3' not in str(data)
        assert Result.query.filter_by(user_id=3).count() == 1
        assert Result.query.filter_by(user_id=1).count() == 2


@pytest.mark.parametrize('present', [2, 3, 4, 5])
def test_start_with_just_present_players_without_automatic_bots(app, clients, present):
    people = [clients(i + 1) for i in range(present)]
    code = create(people[0], 6, 'multiplayer')['code']
    for person in people[1:]:
        assert post(person, '/lobbies/join', {'code': code}).status_code == 200
    assert action(people[0], code, 'start', fillBots=False).status_code == 200
    value = state(people[0], code)
    assert value['capacity'] == len(value['game']['players']) == present
    assert not any(person['isBot'] for person in value['seats'])
    with app.app_context():
        assert Result.query.count() == present


def test_only_host_can_close_lobby_and_all_members_receive_closure(app, clients):
    host, guest, outsider = clients(1), clients(2), clients(3)
    code = create(host, 6, 'multiplayer')['code']
    post(guest, '/lobbies/join', {'code': code})
    assert action(guest, code, 'close').status_code == 400
    socketio = app.extensions['socketio']
    socket = socketio.test_client(app, namespace='/golf', flask_test_client=guest, auth={'csrf_token': guest.golf_token})
    assert socket.emit('golf:subscribe', {'code': code}, namespace='/golf', callback=True)['ok']
    socket.get_received('/golf')
    value = action(host, code, 'close')
    assert value.status_code == 200 and value.json['state']['closed'] is True
    received = socket.get_received('/golf')[-1]['args'][0]
    assert received['closed'] and received['stage'] == 'closed'
    assert state(guest, code)['closed']
    assert action(host, code, 'start', fillBots=True).json['code'] == 'LOBBY_CLOSED'
    assert post(outsider, '/lobbies/join', {'code': code}).json['code'] == 'LOBBY_CLOSED'
    with app.app_context():
        assert Result.query.count() == 0
    socket.disconnect(namespace='/golf')


def test_leaving_lobby_preserves_group_and_transfers_close_permission(app, clients):
    host, guest, friend = clients(1), clients(2), clients(3)
    code = create(host, 3, 'multiplayer')['code']
    post(guest, '/lobbies/join', {'code': code})
    assert action(host, code, 'leave').status_code == 200
    assert state(guest, code)['isHost'] and not state(guest, code)['closed']
    assert post(friend, '/lobbies/join', {'code': code}).status_code == 200
    assert action(guest, code, 'close').status_code == 200


def test_lobby_host_succession_follows_join_order_after_leaving_and_rejoining(app, clients):
    host, returning, next_host, later = [clients(i) for i in range(1, 5)]
    code = create(host, 4, 'multiplayer')['code']
    for person in (returning, next_host, later):
        assert post(person, '/lobbies/join', {'code': code}).status_code == 200
    assert action(returning, code, 'leave').status_code == 200
    assert post(returning, '/lobbies/join', {'code': code}).status_code == 200

    assert action(host, code, 'leave').status_code == 200
    assert state(next_host, code)['isHost']
    assert not state(returning, code)['isHost']
    assert not state(later, code)['isHost']
    assert action(next_host, code, 'leave').status_code == 200
    assert state(later, code)['isHost']
    assert action(later, code, 'leave').status_code == 200
    assert state(returning, code)['isHost']
    assert action(returning, code, 'close').status_code == 200


def test_close_cannot_cancel_an_in_progress_game(app, clients):
    host, friend = clients(1), clients(2)
    code = create(host, 2, 'multiplayer')['code']; post(friend, '/lobbies/join', {'code': code})
    action(host, code, 'start')
    assert action(host, code, 'close').status_code == 400
    assert not state(friend, code)['closed']
