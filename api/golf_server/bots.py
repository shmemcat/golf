"""Public-information bot policy, mirrored by web/src/game/bots.ts."""
from functools import lru_cache
from .cards import RANKS, card_value

VALUES = tuple(map(card_value, RANKS))


class BotPolicy:
    def __init__(self, game, bot_name=None):
        self.expected = lru_cache(maxsize=None)(self.expected)
        self.penalty = lru_cache(maxsize=None)(self.penalty)
        self.value = lru_cache(maxsize=None)(self.value)
        self.discard_cost = lru_cache(maxsize=None)(self.discard_cost)
        self.boards = [tuple(RANKS.index(cell["card"]["rank"]) if cell["faceUp"] else -1
                             for cell in player["cards"]) for player in game["players"]]
        self.seat = game["turn"]
        self.final = game["finalTurns"] is not None
        next_seat = (self.seat + 1) % len(self.boards)
        self.next_board = self.boards[next_seat] if not self.final or next_seat in game["finalTurns"] else None
        self.chase_blocks = bot_name == "Sunny"
        counts = [8] * len(RANKS)
        for board in self.boards:
            for rank in board:
                if rank >= 0:
                    counts[rank] -= 1
        for card in game["discard"] + ([game["drawn"]["card"]] if game["drawn"] else []):
            counts[RANKS.index(card["rank"])] -= 1
        self.counts = tuple(max(0, count) for count in counts)
        # Opponents close to going out reduce the value of planning another turn.
        self.continuation = min((min(1, board.count(-1) / 2) for seat, board in enumerate(self.boards)
                                 if seat != self.seat), default=0) * 0.75

    @staticmethod
    def replace(board, index, rank):
        return board[:index] + (rank,) + board[index + 1:]

    @staticmethod
    def chances(counts):
        total = sum(counts)
        return [(rank, count / total) for rank, count in enumerate(counts) if count] if total else [
            (rank, 1 / len(RANKS)) for rank in range(len(RANKS))]

    def expected(self, board, counts):
        total = sum(counts)
        if not total:
            counts, total = (8,) * len(RANKS), 104
        mean = sum(count * value for count, value in zip(counts, VALUES)) / total

        def matching(indices):
            known = {board[index] for index in indices if board[index] >= 0}
            if len(known) > 1:
                return 0
            hidden = sum(board[index] < 0 for index in indices)
            probability = 0
            for rank in known or range(len(RANKS)):
                chance = 1
                for offset in range(hidden):
                    chance *= max(0, counts[rank] - offset) / (total - offset) if total > offset else 0
                probability += chance
            return probability

        score = 0
        for column in range(3):
            top, bottom = board[column], board[column + 3]
            if top >= 0 and bottom >= 0:
                score += 0 if top == bottom and top != 1 else VALUES[top] + VALUES[bottom]
            elif top >= 0 or bottom >= 0:
                rank = max(top, bottom)
                score += VALUES[rank] + mean - (2 * VALUES[rank] * counts[rank] / total if rank != 1 else 0)
            else:
                score += 2 * mean - sum(2 * VALUES[rank] * count * (count - 1) / (total * (total - 1))
                                        for rank, count in enumerate(counts) if rank != 1)
        # A block replaces two zero-point pairs with -20; twos earn the same extra -20.
        return score - 20 * (matching((0, 1, 3, 4)) + matching((1, 2, 4, 5)) - matching(tuple(range(6))))

    def penalty(self, score, counts):
        safe = 1
        for seat, board in enumerate(self.boards):
            if seat == self.seat:
                continue
            # Give each opponent their final deck draw and best scoring replacement.
            risk = 0
            for rank, chance in self.chances(counts):
                after = list(counts)
                after[rank] = max(0, after[rank] - 1)
                after = tuple(after)
                best = min(self.expected(board, after), *(self.expected(self.replace(board, i, rank), after) for i in range(6)))
                spread = 5 * board.count(-1) ** 0.5
                risk += chance * (float(best <= score) if not spread else max(0, min(1, 0.5 + (score - best) / (2 * spread))))
            safe *= 1 - risk
        return 10 * (1 - safe)

    @staticmethod
    def block_progress(board, counts):
        progress = 0
        for start in (0, 1):
            block = [board[i] for i in (start, start + 1, start + 3, start + 4)]
            for rank in set(block) - {-1}:
                matches = block.count(rank)
                if matches + counts[rank] >= 4:
                    progress = max(progress, matches)
        return progress

    def value(self, board, counts):
        score = self.expected(board, counts)
        if self.final:
            return score
        if -1 not in board:
            result = score + self.penalty(score, counts)
        else:
            # One more draw values live pairs/blocks and the option to keep improving.
            future = 0
            for rank, chance in self.chances(counts):
                after = list(counts)
                after[rank] = max(0, after[rank] - 1)
                after = tuple(after)
                best = min(self.expected(board, after), *(self.expected(self.replace(board, i, rank), after) for i in range(6)))
                future += chance * best
            result = score + self.continuation * (future - score)
        if self.chase_blocks:
            progress = self.block_progress(board, counts)
            # Sunny's Easter egg: block progress outweighs any ordinary score gain.
            result -= 100 * progress
            if -1 not in board and 0 < progress < 4:
                result += 1000  # Keep playing while a block is still possible.
        return result

    def discard_cost(self, rank, counts):
        """Point reduction an obvious new pair/block gives the next player."""
        board = self.next_board
        if board is None:
            return 0  # The hole ends before anyone can use this discard.
        before = self.expected(board, counts)
        benefit = 0
        for index in range(6):
            opposite = (index + 3) % 6
            if board[opposite] == rank and board[index] != rank:
                # Expected scoring includes the full 2x2 bonus, paired twos,
                # and any pair/block that would be lost by this replacement.
                benefit = max(benefit, before - self.expected(self.replace(board, index, rank), counts))
        return benefit

    def choose(self, rank, counts=None, must_use=False):
        counts = self.counts if counts is None else counts
        board = self.boards[self.seat]
        best_index, best_value = -1, self.value(board, counts) + self.discard_cost(rank, counts)
        # A face-down outgoing card has only a public-information distribution.
        hidden_cost = sum(chance * self.discard_cost(hidden_rank, counts) for hidden_rank, chance in self.chances(counts))
        for index in sorted(range(6), key=lambda i: (board[i] >= 0, i)):
            cost = hidden_cost if board[index] < 0 else self.discard_cost(board[index], counts)
            value = self.value(self.replace(board, index, rank), counts) + cost
            if value < best_value - 1e-9 or (must_use and best_index < 0):
                best_index, best_value = index, value
        return best_index, best_value

    def source(self, game):
        if not game["discard"]:
            return "deck"
        if not game["deck"]:
            return "discard"
        index, discard_value = self.choose(RANKS.index(game["discard"][-1]["rank"]))
        if index < 0:
            return "deck"  # Avoid repeatedly swapping identical safe discards.
        deck_value = 0
        for rank, chance in self.chances(self.counts):
            counts = list(self.counts)
            counts[rank] = max(0, counts[rank] - 1)
            deck_value += chance * self.choose(rank, tuple(counts))[1]
        return "discard" if discard_value < deck_value - 1e-9 else "deck"
