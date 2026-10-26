"""Seeded nine-hole games: one revised bot against the previous greedy policy.

Run: uv run --directory api python ../scripts/benchmark-bots.py --games 100
This uses synthetic deals only. Shared lowest totals count as wins.
"""
import argparse
import json
from pathlib import Path
import random
import statistics
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
from golf_server import engine


def previous_replacement(game, card, must_use=False):
    """Freeze the previous strategy here so comparisons remain reproducible."""
    cards = game["players"][game["turn"]]["cards"]
    average = sum(map(engine.card_value, engine.RANKS)) / len(engine.RANKS)
    before = engine.grid_value(cards, average)
    choices = []
    for index, cell in enumerate(cards):
        after = [{"card": card, "faceUp": True} if i == index else current for i, current in enumerate(cards)]
        choices.append((before - engine.grid_value(after, average), not cell["faceUp"], -index))
    gain, _, negative_index = max(choices)
    return -negative_index if gain > 1e-9 or must_use else -1


def previous_source(game):
    return "discard" if game["discard"] and (not game["deck"] or previous_replacement(game, game["discard"][-1]) >= 0) else "deck"


def play(seed, count, revised_seat):
    previous_rng = engine.RNG
    engine.RNG = random.Random(seed)
    try:
        game = engine.deal(count)
        turns = 0
        for hole in range(1, 10):
            for seat in range(count):
                engine.open_bot(game, seat)
            game["discard"].append(game["deck"].pop())
            game["phase"] = "draw"
            for _ in range(2000):
                revised = game["turn"] == revised_seat
                source = engine.bot_source(game) if revised else previous_source(game)
                engine.draw(game, source)
                choose = engine.replacement_index if revised else previous_replacement
                index = choose(game, game["drawn"]["card"], game["drawn"]["source"] == "discard")
                engine.toss(game) if index < 0 else engine.replace(game, index)
                turns += 1
                if game["phase"] in ("round-over", "game-over"):
                    break
            else:
                raise RuntimeError(f"Game stalled: seed={seed}, players={count}, hole={hole}")
            if hole < 9:
                game = engine.next_hole(game)
        return [player["score"] for player in game["players"]], turns
    finally:
        engine.RNG = previous_rng


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--games", type=int, default=100, help="Nine-hole games per table size")
    parser.add_argument("--players", type=int, choices=range(2, 7), nargs="+", default=[2, 4, 6])
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    if args.games < 1:
        parser.error("--games must be positive")
    for count in args.players:
        wins, revised_scores, previous_scores, turns = 0, [], [], []
        for offset in range(args.games):
            seat = offset % count
            scores, game_turns = play(args.seed + offset, count, seat)
            wins += scores[seat] == min(scores)
            revised_scores.append(scores[seat])
            previous_scores.extend(score for i, score in enumerate(scores) if i != seat)
            turns.append(game_turns)
        print(json.dumps({
            "players": count, "games": args.games, "first_seed": args.seed,
            "revised_wins": wins, "revised_win_percent": round(100 * wins / args.games, 1),
            "revised_average_score": round(statistics.mean(revised_scores), 2),
            "previous_average_score": round(statistics.mean(previous_scores), 2),
            "average_turns": round(statistics.mean(turns), 1),
        }), flush=True)


if __name__ == "__main__":
    main()
