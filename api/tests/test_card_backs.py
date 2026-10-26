import pytest

from golf_server.account_remote import decode_identity
from tests.test_golf import action, create, post, state


def test_card_backs_are_shared_without_identity_or_preference_details(app, clients):
    accounts = app.extensions["accounts"]
    accounts.card_backs.update({1: "ginkgo", 2: "north-star"})
    first, second, guest = clients(1), clients(2), clients()
    room = create(first, 3, mode="multiplayer")
    code = room["code"]
    post(second, "/lobbies/join", {"code": code})
    post(guest, "/lobbies/join", {"code": code, "name": "Guest"})
    seats = state(first, code)["seats"]
    assert [seat["cardBack"] for seat in seats] == ["ginkgo", "north-star", "argyle"]
    assert all(set(seat) == {"name", "profileIcon", "cardBack", "isBot", "connected"} for seat in seats)
    # Refreshing an existing player's room updates the durable seat and peers.
    accounts.card_backs[2] = "fern-sprig"
    assert state(second, code)["seats"][1]["cardBack"] == "fern-sprig"
    assert state(first, code)["seats"][1]["cardBack"] == "fern-sprig"
    assert action(first, code, "start").status_code == 200
    assert state(first, code)["seats"][1]["cardBack"] == "fern-sprig"


def test_bots_default_to_argyle_and_rejoining_uses_the_latest_preference(app, clients):
    accounts = app.extensions["accounts"]
    accounts.card_backs[1] = "ginkgo"
    client = clients(1)
    room = create(client, 3)
    assert [seat["cardBack"] for seat in room["seats"]] == ["ginkgo", "argyle", "argyle"]
    accounts.card_backs[1] = "compass"
    assert state(client, room["code"])["seats"][0]["cardBack"] == "compass"


def test_private_identity_decodes_additive_card_back_and_supports_older_servers():
    identity = {"id": 1, "username": "Player", "profile_icon": "cat", "email_verified": True}
    assert decode_identity(identity).golf_card_back == "argyle"
    assert decode_identity({**identity, "golf_card_back": "ginkgo"}).golf_card_back == "ginkgo"


@pytest.mark.parametrize("value", [None, [], True, "x" * 65])
def test_private_identity_rejects_malformed_appearance(value):
    with pytest.raises(ValueError):
        decode_identity({"id": 1, "username": "Player", "profile_icon": "cat", "email_verified": True, "golf_card_back": value})
