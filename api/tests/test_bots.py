import copy
import itertools
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from golf_server import engine
from golf_server.bots import BotPolicy
from golf_server.runtime import GolfRuntime


SCENARIOS = json.loads((Path(__file__).resolve().parents[2] / "testdata" / "bot-decisions.json").read_text())


def scenario_game(scenario):
    def card(rank, identifier):
        return {"rank": rank, "id": identifier, "suit": "S"}

    return dict(players=[{"score": 0, "cards": [
        {"faceUp": rank is not None, "card": card(rank, f"{seat}-{index}")}
        for index, rank in enumerate(board)]} for seat, board in enumerate(scenario["boards"])],
        turn=scenario.get("turn", 0), drawn=None, phase="draw", finalTurns=scenario["finalTurns"],
        deck=[] if scenario.get("emptyDeck") else [{"id": "unknown-deck-card"}],
        discard=[card(rank, f"discard-{index}") for index, rank in enumerate(scenario["discard"])])


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda scenario: scenario["name"])
def test_public_decisions_match_the_browser_policy(scenario):
    game = scenario_game(scenario)
    original = copy.deepcopy(game)
    assert engine.bot_source(game, scenario.get("botName")) == scenario["expectedSource"]
    assert game == original
    if scenario["drawSource"] == "discard":
        game["discard"].pop()
    game["drawn"] = {"card": {"rank": scenario["drawRank"]}, "source": scenario["drawSource"]}
    original = copy.deepcopy(game)
    assert engine.replacement_index(game, game["drawn"]["card"], scenario["drawSource"] == "discard", scenario.get("botName")) == scenario["expectedReplacement"]
    assert game == original


@pytest.mark.parametrize("ranks,pool", [
    (["9", "9", "K", "9", None, "K"], ["9", "2", "Q"]),
    (["2", "2", "K", None, None, "A"], ["2", "2", "9"]),
    (["K", None, "2", "K", None, "A"], ["2", "9", "Q"]),
    ([None, "A", "3", None, "A", "K"], ["9", "9", "2"]),
    ([None] * 6, ["2"] * 6),
    ([None] * 6, ["9"] * 6),
    ([None] * 6, ["9", "9", "9", "9", "K", "2"]),
])
def test_expected_scores_match_exhaustive_hidden_card_possibilities(ranks, pool):
    game = scenario_game(SCENARIOS[0])
    policy = BotPolicy(game)
    counts = tuple(pool.count(rank) for rank in engine.RANKS)
    board = tuple(engine.RANKS.index(rank) if rank is not None else -1 for rank in ranks)
    hidden = [i for i, rank in enumerate(ranks) if rank is None]
    scores = []
    for possibilities in itertools.permutations(pool, len(hidden)):
        actual = list(ranks)
        for index, rank in zip(hidden, possibilities):
            actual[index] = rank
        scores.append(engine.score_grid([{"card": {"rank": rank}} for rank in actual]))
    assert policy.expected(board, counts) == pytest.approx(sum(scores) / len(scores))


@pytest.mark.parametrize("bot_name", [None, "Sunny"])
def test_policy_cannot_access_any_hidden_rank_or_deck_order(bot_name):
    class HiddenCard(dict):
        def __getitem__(self, key):
            raise AssertionError("Bots must never inspect a hidden card")

    game = scenario_game(SCENARIOS[0])
    source = engine.bot_source(game, bot_name)
    game["drawn"] = {"card": {"rank": "K"}, "source": "deck"}
    index = engine.replacement_index(game, game["drawn"]["card"], bot_name=bot_name)
    game["drawn"] = None
    game["deck"] = [HiddenCard(), HiddenCard()]
    for player in game["players"]:
        for cell in player["cards"]:
            if not cell["faceUp"]:
                cell["card"] = HiddenCard()
    assert engine.bot_source(game, bot_name) == source
    game["drawn"] = {"card": {"rank": "K"}, "source": "deck"}
    assert engine.replacement_index(game, game["drawn"]["card"], bot_name=bot_name) == index


def test_public_cards_are_counted_once_and_hidden_cards_are_not_counted():
    game = scenario_game(SCENARIOS[0])
    game["drawn"] = {"card": {"rank": "2"}, "source": "deck"}
    counts = BotPolicy(game).counts
    assert counts[engine.RANKS.index("K")] == 5
    assert counts[engine.RANKS.index("2")] == 6
    assert counts[engine.RANKS.index("Q")] == 8


@pytest.mark.parametrize("board,rank,benefit", [
    (["9", "A", "4", "K", "3", None], "9", 9),
    (["9", "9", "4", "9", "K", None], "9", 29),
    (["K", "9", "9", "4", "9", "A"], "9", 30),
    (["2", "A", "4", "K", "3", None], "2", 2),
    (["2", "2", "4", "2", "K", None], "2", 22),
    (["9", "A", "4", "9", "3", None], "9", 0),
    (["9", "9", "4", "9", "9", None], "9", 0),
    (["9", "9", "9", "9", "9", "K"], "9", 9),
    (["9", "K", "9", "9", "K", "A"], "9", 10),
    ([None] * 6, "9", 0),
])
def test_defensive_cost_uses_actual_pair_and_block_scoring(board, rank, benefit):
    scenario = {**SCENARIOS[0], "boards": [SCENARIOS[0]["boards"][0], board]}
    policy = BotPolicy(scenario_game(scenario))
    assert policy.discard_cost(engine.RANKS.index(rank), policy.counts) == pytest.approx(benefit)


def test_defense_follows_next_seat_without_changing_the_public_card_counts():
    scenario = next(scenario for scenario in SCENARIOS if scenario["name"].startswith("do not defend a later seat"))
    game = scenario_game(scenario)
    game["drawn"] = {"card": {"rank": "K"}, "source": "deck"}
    original = BotPolicy(game)
    assert original.choose(engine.RANKS.index("K"))[0] == 0
    game["players"][1], game["players"][2] = game["players"][2], game["players"][1]
    swapped = BotPolicy(game)
    assert swapped.counts == original.counts
    assert swapped.choose(engine.RANKS.index("K"))[0] == 1


@pytest.mark.parametrize("bot_name", ["Clover", "Birdie", "Maple", "Robin", "sunny"])
def test_only_sunny_gets_the_block_chasing_personality(bot_name):
    scenario = next(scenario for scenario in SCENARIOS if scenario.get("botName") == "Sunny")
    game = scenario_game(scenario)
    assert engine.bot_source(game, bot_name) == engine.bot_source(game) == "deck"
    game["drawn"] = {"card": {"rank": "9"}, "source": "deck"}
    assert engine.replacement_index(game, game["drawn"]["card"], bot_name=bot_name) == -1


@pytest.mark.parametrize("seat", [0, 1])
@pytest.mark.parametrize("name,is_bot", [("Sunny", True), ("Clover", True), ("Sunny", False)])
def test_runtime_selects_sunnys_personality_by_bot_identity_after_seat_changes(seat, name, is_bot):
    scenario = next(scenario for scenario in SCENARIOS if scenario.get("botName") == "Sunny")
    game = scenario_game(scenario)
    if seat:
        game["players"].reverse()
    game["turn"] = seat
    game["deck"] = [{"id": "drawn-nine", "rank": "9", "suit": "S"}]
    data = {"game": game, "seats": [{"name": "Other", "isBot": False} for _ in range(2)]}
    data["seats"][seat] = {"name": name, "isBot": is_bot}
    runtime = GolfRuntime(SimpleNamespace(config={"GOLF_TIMINGS": {"flight": 0}}), None)
    runtime.step(data, "bot")
    sunny = name == "Sunny" and is_bot
    assert data["motion"]["source"] == ("discard" if sunny else "deck")
    game.update(phase="replace", drawn={"card": {"id": "drawn-nine", "rank": "9"}, "source": "deck"})
    runtime.step(data, "bot")
    assert data["motion"]["kind"] == ("discard" if sunny else "toss")
    assert data["motion"]["index"] == (1 if sunny else -1)
