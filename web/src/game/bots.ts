// Public-information policy, mirrored by api/golf_server/bots.py.
import { RANKS, cardValue } from "./cards";
import type { DrawSource, Game } from "./engine";

const VALUES = RANKS.map(cardValue);
type Board = readonly number[];
type Counts = readonly number[];

export class BotPolicy {
  private readonly boards: Board[];
  private readonly seat: number;
  private readonly final: boolean;
  private readonly nextBoard: Board | null;
  private readonly chaseBlocks: boolean;
  private readonly counts: Counts;
  private readonly continuation: number;
  private readonly expectedCache = new Map<string, number>();
  private readonly penaltyCache = new Map<string, number>();
  private readonly valueCache = new Map<string, number>();
  private readonly discardCostCache = new Map<string, number>();

  constructor(game: Game, botName?: string) {
    this.boards = game.players.map(player => player.cards.map(cell => cell.faceUp ? RANKS.indexOf(cell.card.rank) : -1));
    this.seat = game.turn;
    this.final = game.finalTurns !== null;
    const nextSeat = (this.seat + 1) % this.boards.length;
    this.nextBoard = !this.final || game.finalTurns!.includes(nextSeat) ? this.boards[nextSeat] : null;
    this.chaseBlocks = botName === "Sunny";
    const counts = RANKS.map(() => 8);
    for (const board of this.boards) for (const rank of board) if (rank >= 0) counts[rank]--;
    for (const card of [...game.discard, ...(game.drawn ? [game.drawn.card] : [])]) counts[RANKS.indexOf(card.rank)]--;
    this.counts = counts.map(count => Math.max(0, count));
    // Opponents close to going out reduce the value of planning another turn.
    this.continuation = Math.min(...this.boards.filter((_, seat) => seat !== this.seat)
      .map(board => Math.min(1, board.filter(rank => rank < 0).length / 2))) * 0.75;
  }

  private replace(board: Board, index: number, rank: number): Board {
    return board.map((current, i) => i === index ? rank : current);
  }

  private chances(counts: Counts): [number, number][] {
    const total = counts.reduce((sum, count) => sum + count, 0);
    return total ? counts.flatMap((count, rank) => count ? [[rank, count / total] as [number, number]] : [])
      : RANKS.map((_, rank) => [rank, 1 / RANKS.length]);
  }

  private afterDraw(counts: Counts, rank: number): Counts {
    return counts.map((count, i) => i === rank ? Math.max(0, count - 1) : count);
  }

  private expected(board: Board, originalCounts: Counts): number {
    const key = `${board}|${originalCounts}`;
    const cached = this.expectedCache.get(key);
    if (cached !== undefined) return cached;
    let counts = originalCounts;
    let total = counts.reduce((sum, count) => sum + count, 0);
    if (!total) { counts = RANKS.map(() => 8); total = 104; }
    const mean = counts.reduce((sum, count, rank) => sum + count * VALUES[rank], 0) / total;
    const matching = (indices: number[]): number => {
      const known = new Set(indices.map(index => board[index]).filter(rank => rank >= 0));
      if (known.size > 1) return 0;
      const hidden = indices.filter(index => board[index] < 0).length;
      let probability = 0;
      for (const rank of known.size ? known : RANKS.map((_, i) => i)) {
        let chance = 1;
        for (let offset = 0; offset < hidden; offset++) {
          chance *= total > offset ? Math.max(0, counts[rank] - offset) / (total - offset) : 0;
        }
        probability += chance;
      }
      return probability;
    };
    let score = 0;
    for (let column = 0; column < 3; column++) {
      const top = board[column];
      const bottom = board[column + 3];
      if (top >= 0 && bottom >= 0) score += top === bottom && top !== 1 ? 0 : VALUES[top] + VALUES[bottom];
      else if (top >= 0 || bottom >= 0) {
        const rank = Math.max(top, bottom);
        score += VALUES[rank] + mean - (rank !== 1 ? 2 * VALUES[rank] * counts[rank] / total : 0);
      } else {
        score += 2 * mean - counts.reduce((sum, count, rank) => rank === 1 ? sum
          : sum + 2 * VALUES[rank] * count * (count - 1) / (total * (total - 1)), 0);
      }
    }
    // A block replaces two zero-point pairs with -20; twos earn the same extra -20.
    score -= 20 * (matching([0, 1, 3, 4]) + matching([1, 2, 4, 5]) - matching([0, 1, 2, 3, 4, 5]));
    this.expectedCache.set(key, score);
    return score;
  }

  private penalty(score: number, counts: Counts): number {
    const key = `${score}|${counts}`;
    const cached = this.penaltyCache.get(key);
    if (cached !== undefined) return cached;
    let safe = 1;
    this.boards.forEach((board, seat) => {
      if (seat === this.seat) return;
      // Give each opponent their final deck draw and best scoring replacement.
      let risk = 0;
      for (const [rank, chance] of this.chances(counts)) {
        const after = this.afterDraw(counts, rank);
        const best = Math.min(this.expected(board, after), ...board.map((_, i) => this.expected(this.replace(board, i, rank), after)));
        const spread = 5 * Math.sqrt(board.filter(rank => rank < 0).length);
        risk += chance * (spread ? Math.max(0, Math.min(1, 0.5 + (score - best) / (2 * spread))) : Number(best <= score));
      }
      safe *= 1 - risk;
    });
    const result = 10 * (1 - safe);
    this.penaltyCache.set(key, result);
    return result;
  }

  private value(board: Board, counts: Counts): number {
    const key = `${board}|${counts}`;
    const cached = this.valueCache.get(key);
    if (cached !== undefined) return cached;
    const score = this.expected(board, counts);
    let result = score;
    if (!this.final && !board.includes(-1)) result += this.penalty(score, counts);
    else if (!this.final) {
      // One more draw values live pairs/blocks and the option to keep improving.
      let future = 0;
      for (const [rank, chance] of this.chances(counts)) {
        const after = this.afterDraw(counts, rank);
        const best = Math.min(this.expected(board, after), ...board.map((_, i) => this.expected(this.replace(board, i, rank), after)));
        future += chance * best;
      }
      result += this.continuation * (future - score);
    }
    if (this.chaseBlocks && !this.final) {
      const progress = this.blockProgress(board, counts);
      // Sunny's Easter egg: block progress outweighs any ordinary score gain.
      result -= 100 * progress;
      if (!board.includes(-1) && progress > 0 && progress < 4) result += 1000; // Keep chasing a possible block.
    }
    this.valueCache.set(key, result);
    return result;
  }

  private blockProgress(board: Board, counts: Counts): number {
    let progress = 0;
    for (const start of [0, 1]) {
      const block = [start, start + 1, start + 3, start + 4].map(index => board[index]);
      for (const rank of new Set(block.filter(rank => rank >= 0))) {
        const matches = block.filter(current => current === rank).length;
        if (matches + counts[rank] >= 4) progress = Math.max(progress, matches);
      }
    }
    return progress;
  }

  private discardCost(rank: number, counts: Counts): number {
    const key = `${rank}|${counts}`;
    const cached = this.discardCostCache.get(key);
    if (cached !== undefined) return cached;
    const board = this.nextBoard;
    if (!board) return 0; // The hole ends before anyone can use this discard.
    const before = this.expected(board, counts);
    let benefit = 0;
    for (let index = 0; index < 6; index++) {
      const opposite = (index + 3) % 6;
      if (board[opposite] === rank && board[index] !== rank) {
        // Include the full 2x2 bonus, paired twos, and any lost pair/block.
        benefit = Math.max(benefit, before - this.expected(this.replace(board, index, rank), counts));
      }
    }
    this.discardCostCache.set(key, benefit);
    return benefit;
  }

  choose(rank: number, counts: Counts = this.counts, mustUse = false): [number, number] {
    const board = this.boards[this.seat];
    let bestIndex = -1;
    let bestValue = this.value(board, counts) + this.discardCost(rank, counts);
    // A face-down outgoing card has only a public-information distribution.
    const hiddenCost = this.chances(counts).reduce((sum, [hiddenRank, chance]) => sum + chance * this.discardCost(hiddenRank, counts), 0);
    const indices = board.map((_, i) => i).sort((a, b) => Number(board[a] >= 0) - Number(board[b] >= 0) || a - b);
    for (const index of indices) {
      const cost = board[index] < 0 ? hiddenCost : this.discardCost(board[index], counts);
      const value = this.value(this.replace(board, index, rank), counts) + cost;
      if (value < bestValue - 1e-9 || (mustUse && bestIndex < 0)) {
        bestIndex = index;
        bestValue = value;
      }
    }
    return [bestIndex, bestValue];
  }

  source(game: Game): DrawSource {
    if (!game.discard.length) return "deck";
    if (!game.deck.length) return "discard";
    const [index, discardValue] = this.choose(RANKS.indexOf(game.discard[game.discard.length - 1].rank));
    if (index < 0) return "deck"; // Avoid repeatedly swapping identical safe discards.
    let deckValue = 0;
    for (const [rank, chance] of this.chances(this.counts)) deckValue += chance * this.choose(rank, this.afterDraw(this.counts, rank))[1];
    return discardValue < deckValue - 1e-9 ? "discard" : "deck";
  }
}
