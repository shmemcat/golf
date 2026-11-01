from test_golf import action, create, post, state


def test_cap_blocks_new_rooms_and_joins_without_blocking_existing_games(app, clients):
    app.config["MAX_IN_PROGRESS_GAMES"] = 2
    one, other = clients(1), clients(2)
    first, second = create(one), create(one)
    lobby = create(other, mode="multiplayer")
    assert (
        post(one, "/bots", {"players": 2, "requestId": "new-request"}).status_code
        == 409
    )
    assert post(one, "/lobbies/join", {"code": lobby["code"]}).status_code == 409
    assert state(one, second["code"])["code"] == second["code"]
    assert action(one, first["code"], "leave").status_code == 200
    assert post(one, "/lobbies/join", {"code": lobby["code"]}).status_code == 200
    assert create(one)["game"]


def test_create_retries_do_not_consume_the_minute_allowance(app, clients):
    one = clients(1)
    first = create(one, rid="same-request")
    for _ in range(4):
        create(one)
    assert create(one, rid="same-request")["code"] == first["code"]
    blocked = post(one, "/lobbies", {"players": 2, "requestId": "sixth-request"})
    assert blocked.status_code == 429 and blocked.headers["Retry-After"] == "60"
    assert create(clients(2))["game"]


def test_creation_window_expires_and_is_separate_per_player(app):
    import pytest
    from golf_server.game_limits import GameLimit, check_creation

    with app.app_context():
        for _ in range(5):
            check_creation("account:rate-test")
        with pytest.raises(GameLimit) as error:
            check_creation("account:rate-test")
        assert error.value.status == 429
        check_creation("account:another-player")
        app.extensions["game_creation_times"]["account:rate-test"] = [-1000]
        check_creation("account:rate-test")
