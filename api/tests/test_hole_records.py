"""Completed hands remain public, durable and attached to their original players."""
import copy

import pytest

from golf_server.application import create_app
from golf_server.extensions import db
from golf_server.models import Room
from test_golf import action, create, post, state
from test_hole_transition import finish_hole


def test_records_are_saved_immediately_and_survive_dealing_and_service_restart(app, clients):
    person = clients(1)
    code = create(person, 3)['code']
    initial = state(person, code)
    assert initial['holeRecords'] == []
    assert all(set(cell['card']) == {'id'} for player in initial['game']['players'] for cell in player['cards'])

    finish_hole(app, code)
    finished = state(person, code)
    records = finished['holeRecords']
    assert len(records) == 1 and records[0]['hole'] == 1
    assert records[0]['wentOut'] == 1
    assert [player['cards'] for player in records[0]['players']] == [
        [cell['card'] for cell in player['cards']] for player in finished['game']['players']]
    assert [player['score'] for player in records[0]['players']] == finished['game']['history'][-1]
    assert all('actor' not in player for player in records[0]['players'])
    assert state(person, code)['holeRecords'] == records
    with app.app_context():
        assert len(db.session.get(Room, code).data['holeRecords']) == 1

    advanced = action(person, code, 'advance').json['state']
    assert advanced['game']['hole'] == 2 and advanced['holeRecords'] == records
    assert all(set(cell['card']) == {'id'} for player in advanced['game']['players'] for cell in player['cards'])
    old_ids = {card['id'] for player in records[0]['players'] for card in player['cards']}
    new_ids = {cell['card']['id'] for player in advanced['game']['players'] for cell in player['cards']}
    assert old_ids.isdisjoint(new_ids)

    finish_hole(app, code)
    second = state(person, code)['holeRecords']
    assert [record['hole'] for record in second] == [1, 2]
    assert second[0] == records[0]
    recreated = create_app({**app.config, 'START_GOLF_WORKER': False}, accounts=app.extensions['accounts'])
    try:
        reconnected = recreated.test_client()
        reconnected.set_cookie('test_account', '1')
        assert state(reconnected, code)['holeRecords'] == second
    finally:
        with recreated.app_context():
            db.session.remove()
            db.engine.dispose()


def test_records_keep_original_names_scores_and_cards_when_a_player_leaves(app, clients):
    people = [clients(uid) for uid in (1, 2, 3)]
    code = create(people[0], 3, 'multiplayer')['code']
    for person in people[1:]:
        assert post(person, '/lobbies/join', {'code': code}).status_code == 200
    assert action(people[0], code, 'start').status_code == 200
    finish_hole(app, code)
    original = state(people[0], code)['holeRecords'][0]
    by_name = {player['name']: player for player in original['players']}
    for uid, person in enumerate(people, 1):
        record = state(person, code)['holeRecords'][0]
        assert record['players'][0]['name'] == f'Player {uid}'
        assert record['players'][record['wentOut']]['name'] == 'Player 2'
        assert {player['name']: player for player in record['players']} == by_name

    assert action(people[1], code, 'leave').status_code == 200
    for person in (people[0], people[2]):
        current = state(person, code)
        assert len(current['game']['players']) == 2
        record = current['holeRecords'][0]
        assert {player['name']: player for player in record['players']} == by_name
        assert record['players'][record['wentOut']]['name'] == 'Player 2'
    assert action(people[0], code, 'advance').status_code == 200
    finish_hole(app, code)
    records = state(people[0], code)['holeRecords']
    assert len(records[0]['players']) == 3
    assert [player['name'] for player in records[1]['players']] == ['Player 1', 'Player 3']


def test_reviewing_the_previous_hole_receives_its_records_without_new_hidden_cards(app, clients):
    person, friend = clients(1), clients(2)
    code = create(person, 2, 'multiplayer')['code']
    assert post(friend, '/lobbies/join', {'code': code}).status_code == 200
    assert action(person, code, 'start').status_code == 200
    finish_hole(app, code)
    before = state(friend, code)['holeRecords']
    assert action(person, code, 'advance').status_code == 200
    reviewing = state(friend, code)
    assert reviewing['game']['hole'] == 1 and reviewing['game']['phase'] == 'round-over'
    assert reviewing['holeRecords'] == before
    assert state(person, code)['game']['hole'] == 2
    assert len(state(person, code)['holeRecords']) == 1


def test_ninth_hole_is_recorded_and_rematching_starts_a_fresh_record(app, clients):
    person = clients(1)
    code = create(person, 2)['code']
    for hole in range(1, 10):
        finish_hole(app, code)
        finished = state(person, code)
        assert [record['hole'] for record in finished['holeRecords']] == list(range(1, hole + 1))
        if hole < 9:
            assert action(person, code, 'advance').status_code == 200
    assert finished['game']['phase'] == 'game-over'
    restarted = action(person, code, 'restart').json['state']
    assert restarted['game']['id'] != finished['game']['id']
    assert restarted['holeRecords'] == []


@pytest.mark.parametrize('left_first', [False, True])
def test_account_deletion_anonymizes_archived_players_even_after_departure(app, clients, left_first):
    people = [clients(uid) for uid in (1, 2, 3)]
    code = create(people[0], 3, 'multiplayer')['code']
    for person in people[1:]:
        assert post(person, '/lobbies/join', {'code': code}).status_code == 200
    assert action(people[0], code, 'start').status_code == 200
    finish_hole(app, code)
    if left_first:
        assert action(people[1], code, 'leave').status_code == 200
    headers = {'Authorization': 'Bearer ' + 'deletion-token-' * 4, 'X-Cards-Service': 'accounts'}
    response = people[0].post('/_internal/games/v1/golf/delete-user',
                              json={'user_id': 2, 'request_id': 'delete-archived-player'}, headers=headers)
    assert response.status_code == 200
    records = state(people[0], code)['holeRecords']
    assert 'Deleted player' in [player['name'] for player in records[0]['players']]
    with app.app_context():
        saved = db.session.get(Room, code).data
        assert 'account:2' not in str(saved)
        assert 'Player 2' not in str(saved['holeRecords'])


def test_legacy_rooms_recover_only_retained_completed_boards(app, clients):
    person = clients(1)
    code = create(person, 2)['code']
    finish_hole(app, code)
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        data.pop('holeRecords')
        row.data = data
        db.session.commit()
    recovered = state(person, code)['holeRecords']
    assert [record['hole'] for record in recovered] == [1]
    advanced = action(person, code, 'advance').json['state']
    assert advanced['holeRecords'] == recovered
