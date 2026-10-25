import copy
import pytest
from golf_server import engine
from golf_server.extensions import db
from golf_server.models import Room
from test_golf import action, create, playing, post, state, tick


def finish_hole(app, code):
    with app.app_context():
        runtime = app.extensions['golf_runtime']
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.data)
        game = data['game']
        game.update(phase='draw', turn=0, finalTurns=[0])
        engine.draw(game, 'deck')
        engine.toss(game)
        data.update(stage='playing', motion=None, next=None)
        runtime.next_turn(data)
        runtime.save(row, data, 'test_hole_finished')


@pytest.mark.parametrize('count', range(2, 7))
def test_next_hole_is_individual_and_waits_only_for_starting_cards(app, clients, count):
    people = [clients(i + 1) for i in range(count)]
    code = create(people[0], count, 'multiplayer')['code']
    for person in people[1:]:
        assert post(person, '/lobbies/join', {'code': code}).status_code == 200
    assert action(people[0], code, 'start').status_code == 200
    finish_hole(app, code)
    completed = state(people[0], code)['game']

    # A non-host can deal the next hole while everyone else reviews the last one.
    first = people[-1]
    advanced = action(first, code, 'advance').json['state']
    assert advanced['game']['hole'] == 2 and advanced['stage'] == 'dealing'
    for person in people[:-1]:
        assert state(person, code)['game'] == completed
        assert state(person, code)['stage'] == 'playing'
    tick(app)
    next_cards = [c['card']['id'] for p in state(first, code)['game']['players'] for c in p['cards']]

    # Rejoining receives the same completed board, including while others flip.
    socket = app.extensions['socketio'].test_client(
        app, namespace='/golf', flask_test_client=people[0],
        auth={'csrf_token': people[0].golf_token}, headers={'Origin': 'http://localhost:3003'})
    try:
        reply = socket.emit('golf:subscribe', {'code': code}, namespace='/golf', callback=True)
        assert reply['ok'] and reply['state']['game'] == completed
        assert action(people[0], code, 'reveal', index=0).status_code == 400
        assert action(first, code, 'advance').status_code == 400
        for index in (0, 4):
            assert action(first, code, 'reveal', index=index).status_code == 200
        tick(app, 3)
        assert state(first, code)['stage'] == 'opening'
        assert state(people[0], code)['game'] == completed
        updates = [event['args'][0] for event in socket.get_received('/golf') if event['name'] == 'golf:state']
        assert updates and all(update['game'] == completed for update in updates)

        for person in people[:-1]:
            advanced = action(person, code, 'advance').json['state']
            assert advanced['game']['hole'] == 2 and advanced['stage'] == 'opening'
            assert [c['card']['id'] for p in advanced['game']['players'] for c in p['cards']] == next_cards
            assert advanced['game']['history'] == completed['history']
            assert [p['score'] for p in advanced['game']['players']] == [p['score'] for p in completed['players']]
            for index in (0, 4):
                assert action(person, code, 'reveal', index=index).status_code == 200
        assert playing(app, first, code)['game']['hole'] == 2

        # The next completed hole replaces the retained board for every player.
        finish_hole(app, code)
        for person in people:
            current = state(person, code)['game']
            assert current['hole'] == 2 and current['phase'] == 'round-over'
        assert action(people[0], code, 'advance').json['state']['game']['hole'] == 3
        assert state(first, code)['game']['hole'] == 2
    finally:
        socket.disconnect(namespace='/golf')


def test_leaving_the_previous_hole_does_not_hold_up_starting_cards(app, clients):
    person, friend = clients(1), clients(2)
    code = create(person, 3, 'multiplayer')['code']
    assert post(friend, '/lobbies/join', {'code': code}).status_code == 200
    assert action(person, code, 'start', fillBots=True).status_code == 200
    finish_hole(app, code)
    assert action(person, code, 'advance').status_code == 200
    tick(app)
    for index in (0, 4):
        assert action(person, code, 'reveal', index=index).status_code == 200
    assert state(person, code)['stage'] == 'opening'
    assert action(friend, code, 'leave').status_code == 200
    value = playing(app, person, code)
    assert value['game']['hole'] == 2
    assert value['seats'][1]['isBot']
