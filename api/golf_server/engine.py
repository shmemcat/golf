"""Server-owned Six Card Golf rules. Hidden cards never leave this module's state."""
import copy
import random
import uuid

RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "C", "D")
RNG = random.SystemRandom()


def card_value(rank):
    return {"A": 1, "2": -2, "J": 10, "Q": 10, "K": 0}.get(rank, int(rank) if rank.isdigit() else 0)


def deal(count, hole=1, starter=None, scores=None, history=None, game_id=None):
    if type(count) is not int or not 2 <= count <= 6:
        raise ValueError("Choose two to six players.")
    deck = [{"id": uuid.uuid4().hex, "rank": rank, "suit": suit} for _ in range(2) for suit in SUITS for rank in RANKS]
    RNG.shuffle(deck)
    players = [{"cards": [], "score": (scores or [0] * count)[seat]} for seat in range(count)]
    for _ in range(6):
        for player in players:
            player["cards"].append({"card": deck.pop(), "faceUp": False})
    starter = RNG.randrange(count) if starter is None else starter
    return dict(id=game_id or str(uuid.uuid4()), players=players, deck=deck, discard=[], drawn=None,
                hole=hole, starter=starter, turn=starter, phase="opening", finalTurns=None, history=history or [])


def can_open(game, seat, index):
    if type(index) is not int or not 0 <= index < 6 or game["phase"] != "opening":
        return False
    cards = game["players"][seat]["cards"]
    opened = [i for i, cell in enumerate(cards) if cell["faceUp"]]
    return (not cards[index]["faceUp"] and len(opened) < 2
            and all(i // 3 != index // 3 and i % 3 != index % 3 for i in opened))


def reveal(game, seat, index):
    if not can_open(game, seat, index):
        raise ValueError("Choose one starting card in each row, in different columns.")
    game["players"][seat]["cards"][index]["faceUp"] = True


def open_bot(game, seat):
    cards = game["players"][seat]["cards"]
    while sum(cell["faceUp"] for cell in cards) < 2:
        reveal(game, seat, RNG.choice([i for i in range(6) if can_open(game, seat, i)]))


def visible_bonus(cards):
    return any(all(cards[i]["faceUp"] and cards[i]["card"]["rank"] == cards[start]["card"]["rank"]
                   for i in (start, start + 1, start + 3, start + 4)) for start in (0, 1))


def grid_value(cards, hidden=0):
    def column(i):
        top, bottom = cards[i], cards[i + 3]
        if (top["faceUp"] and bottom["faceUp"] and top["card"]["rank"] == bottom["card"]["rank"]
                and top["card"]["rank"] != "2"):
            return 0
        return sum(card_value(c["card"]["rank"]) if c["faceUp"] else hidden for c in (top, bottom))
    for start in (0, 1):
        if all(cards[i]["faceUp"] and cards[i]["card"]["rank"] == cards[start]["card"]["rank"] for i in (start, start + 1, start + 3, start + 4)):
            return (-28 if cards[start]["card"]["rank"] == "2" else -20) + column(2 if start == 0 else 0)
    return sum(column(i) for i in range(3))


def score_grid(cards):
    return grid_value([{**c, "faceUp": True} for c in cards])


def replacement_index(game, card, must_use=False):
    cards = game["players"][game["turn"]]["cards"]
    average = sum(map(card_value, RANKS)) / len(RANKS)
    before = grid_value(cards, average)
    choices = []
    for index, cell in enumerate(cards):
        after = [({"card": card, "faceUp": True} if i == index else current) for i, current in enumerate(cards)]
        choices.append((before - grid_value(after, average), not cell["faceUp"], -index))
    gain, _, negative_index = max(choices)
    return -negative_index if gain > 1e-9 or must_use else -1


def bot_source(game):
    return "discard" if game["discard"] and (not game["deck"] or replacement_index(game, game["discard"][-1]) >= 0) else "deck"


def draw(game, source):
    if game["phase"] != "draw" or source not in ("deck", "discard") or not game[source]:
        raise ValueError("Choose an available draw pile.")
    game["drawn"] = {"card": game[source].pop(), "source": source}
    game["phase"] = "replace"


def finish_turn(game):
    seat = game["turn"]
    final = game["finalTurns"]
    if final is not None:
        final = [s for s in final if s != seat]
    elif all(c["faceUp"] for c in game["players"][seat]["cards"]):
        final = [(seat + i) % len(game["players"]) for i in range(1, len(game["players"]))]
        game["wentOut"] = seat
    game["finalTurns"] = final
    game["drawn"] = None
    if final == []:
        finish_hole(game, game.get("wentOut", (seat + 1) % len(game["players"])))
        return
    if not game["deck"] and len(game["discard"]) > 1:
        game["deck"] = game["discard"][:-1]
        RNG.shuffle(game["deck"])
        game["discard"] = game["discard"][-1:]
    game["phase"] = "draw"
    game["turn"] = (seat + 1) % len(game["players"])


def finish_hole(game, went_out):
    scores = [score_grid(p["cards"]) for p in game["players"]]
    if went_out is not None and any(other != went_out and score <= scores[went_out] for other, score in enumerate(scores)):
        scores[went_out] += 10
    game["history"].append(scores)
    for player, score in zip(game["players"], scores):
        player["score"] += score
        for cell in player["cards"]:
            cell["faceUp"] = True
    game["phase"] = "game-over" if game["hole"] == 9 else "round-over"


def remove_player(game, seat):
    """Remove a board while preserving the remaining players' hole and turns."""
    count = len(game["players"])
    final = game["finalTurns"]
    if final and "wentOut" not in game:
        game["wentOut"] = (final[-1] + 1) % count
    active = game["phase"] in ("draw", "replace")
    own_turn = game["turn"] == seat
    if own_turn and game["drawn"]:
        game["discard"].append(game["drawn"]["card"])
        game["drawn"] = None
    returned = [cell["card"] for cell in game["players"].pop(seat)["cards"]]
    RNG.shuffle(returned)
    game["deck"][0:0] = returned
    game["history"] = [[score for i, score in enumerate(hole) if i != seat] for hole in game["history"]]
    remaining = count - 1

    def remap(index):
        if index == seat:
            return seat % remaining if remaining else 0
        return index - (index > seat)

    game["starter"] = remap(game["starter"])
    game["turn"] = remap(game["turn"])
    if "wentOut" in game and game["wentOut"] is not None:
        game["wentOut"] = None if game["wentOut"] == seat else remap(game["wentOut"])
    if final is not None:
        game["finalTurns"] = [remap(index) for index in final if index != seat]
    if active and own_turn:
        game["phase"] = "draw"
        if game["finalTurns"]:
            game["turn"] = game["finalTurns"][0]
    if active and remaining >= 2 and game["finalTurns"] == []:
        finish_hole(game, game.get("wentOut"))


def replace(game, index):
    if game["phase"] != "replace" or not game["drawn"] or type(index) is not int or not 0 <= index < 6:
        raise ValueError("Choose a card on your board.")
    cell = game["players"][game["turn"]]["cards"][index]
    game["discard"].append(cell["card"])
    game["players"][game["turn"]]["cards"][index] = {"card": game["drawn"]["card"], "faceUp": True}
    finish_turn(game)


def toss(game):
    if game["phase"] != "replace" or not game["drawn"] or game["drawn"]["source"] != "deck":
        raise ValueError("A discard-pile draw must be used.")
    game["discard"].append(game["drawn"]["card"])
    finish_turn(game)


def next_hole(game):
    if game["phase"] != "round-over":
        raise ValueError("Finish this hole first.")
    return deal(len(game["players"]), game["hole"] + 1, (game["starter"] + 1) % len(game["players"]),
                [p["score"] for p in game["players"]], copy.deepcopy(game["history"]), game["id"])
