"""Ranks and point values shared by the rules engine and bot policy."""
RANKS = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")
SUITS = ("S", "H", "C", "D")


def card_value(rank):
    return {"A": 1, "2": -2, "J": 10, "Q": 10, "K": 0}.get(rank, int(rank) if rank.isdigit() else 0)
