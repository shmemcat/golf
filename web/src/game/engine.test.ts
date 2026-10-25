import { describe, expect, it, vi } from "vitest";
import {
  botSource, canOpen, cardValue, createGame, discardDraw, drawCard, nextHole,
  openCard, openOpponents, replaceCard, replacementIndex, scoreGrid, startPlay,
  turnUpDeck, type Game, type GridCard, type Rank,
} from "./engine";
import { SEAT_LAYOUTS } from "./seats";

function ready(count = 4): Game {
  return startPlay(turnUpDeck(openOpponents(openCard(openCard(createGame(count), 0), 4))));
}
function grid(ranks: Rank[]): GridCard[] {
  return ranks.map((rank, i) => ({ card: { id: `test-${i}`, rank, suit: "S" }, faceUp: true }));
}
function allIds(game: Game) {
  return [...game.deck, ...game.discard, ...(game.drawn ? [game.drawn.card] : []),
    ...game.players.flatMap(player => player.cards.map(cell => cell.card))].map(card => card.id);
}

describe("Golf rules and table seats", () => {
  it.each([2, 3, 4, 5, 6])("deals six cards to %i clockwise seats, always with the human bottom center", count => {
    const game = createGame(count);
    expect(game.players).toHaveLength(count);
    expect(game.players.every(player => player.cards.length === 6 && player.cards.every(cell => !cell.faceUp))).toBe(true);
    expect(game.deck).toHaveLength(104 - count * 6);
    expect(allIds(game)).toHaveLength(104);
    expect(new Set(allIds(game)).size).toBe(104);
    expect(SEAT_LAYOUTS[count]).toHaveLength(count);
    expect(new Set(SEAT_LAYOUTS[count]).size).toBe(count);
    expect(SEAT_LAYOUTS[count][0]).toBe("bottom");
  });

  it("accepts one opening card per row in separate columns and waits for every opening before the upcard", () => {
    const dealt = createGame(6);
    expect(turnUpDeck(dealt)).toBe(dealt);
    expect(openOpponents(dealt)).toBe(dealt);
    const first = openCard(dealt, 0);
    expect(canOpen(first, 3)).toBe(false);
    expect([0, 1, 2, 3].every(index => !canOpen(first, index))).toBe(true);
    expect([4, 5].every(index => canOpen(first, index))).toBe(true);
    expect(openCard(first, 3)).toBe(first);
    const opened = openCard(first, 5);
    expect(openCard(opened, 1)).toBe(opened);
    expect(dealt.players[0].cards.every(cell => !cell.faceUp)).toBe(true);
    const bots = openOpponents(opened);
    for (const player of bots.players) {
      const indices = player.cards.flatMap((cell, i) => cell.faceUp ? [i] : []);
      expect(indices).toHaveLength(2);
      expect(Math.floor(indices[0] / 3)).not.toBe(Math.floor(indices[1] / 3));
      expect(indices[0] % 3).not.toBe(indices[1] % 3);
    }
    expect(startPlay(bots)).toBe(bots);
    const upcard = turnUpDeck(bots);
    expect(upcard.discard).toHaveLength(1);
    expect(turnUpDeck(upcard)).toBe(upcard);
    expect(startPlay(upcard).phase).toBe("draw");
  });

  it.each([0, 1, 2, 3, 4, 5])("restricts the second opening card after choosing position %i first", firstIndex => {
    const first = openCard(createGame(2), firstIndex);
    for (let index = 0; index < 6; index++) {
      const legal = Math.floor(index / 3) !== Math.floor(firstIndex / 3) && index % 3 !== firstIndex % 3;
      expect(canOpen(first, index)).toBe(legal);
      const second = openCard(first, index);
      if (!legal) expect(second).toBe(first);
      else {
        expect(second.players[0].cards.filter(cell => cell.faceUp)).toHaveLength(2);
        expect(second.players[0].cards.every((_, i) => !canOpen(second, i))).toBe(true);
      }
    }
  });

  it.each([0, 0.49, 0.99])("keeps bot opening cards in opposite rows and different columns with randomness %f", random => {
    vi.spyOn(Math, "random").mockReturnValue(random);
    const game = openOpponents(openCard(openCard(createGame(6), 5), 0));
    for (const player of game.players) {
      const indices = player.cards.flatMap((cell, i) => cell.faceUp ? [i] : []);
      expect(indices).toHaveLength(2);
      expect(indices[0]).toBeLessThan(3);
      expect(indices[1]).toBeGreaterThanOrEqual(3);
      expect(indices[0] % 3).not.toBe(indices[1] % 3);
    }
  });

  it("replaces and exposes a face-down card, discards its original, then advances clockwise", () => {
    const original = { ...ready(), turn: 0 };
    const drawn = drawCard(original, "deck");
    const old = original.players[0].cards[2].card;
    expect(drawCard(drawn, "discard")).toBe(drawn);
    const result = replaceCard(drawn, 2);
    expect(result.players[0].cards[2]).toEqual({ card: drawn.drawn!.card, faceUp: true });
    expect(result.discard.at(-1)).toBe(old);
    expect(result.turn).toBe(1);
    expect(result.drawn).toBeNull();
    expect(result.phase).toBe("draw");
    expect(new Set(allIds(result)).size).toBe(104);
    expect(original.players[0].cards[2].faceUp).toBe(false);
  });

  it("allows tossing a deck draw, but requires using a discard draw", () => {
    const original = ready();
    const discard = drawCard(original, "discard");
    expect(discardDraw(discard)).toBe(discard);
    const deck = drawCard(original, "deck");
    const result = discardDraw(deck);
    expect(result.discard.at(-1)).toBe(deck.drawn!.card);
    expect(result.players).toBe(original.players);
    expect(result.turn).toBe((original.turn + 1) % original.players.length);
  });

  it("reshuffles an exhausted deck while retaining the top discard and every card", () => {
    const original = ready();
    const game = { ...original, deck: original.deck.slice(-1), discard: [...original.discard, ...original.deck.slice(0, -1)] };
    const drawn = drawCard(game, "deck");
    const result = discardDraw(drawn);
    expect(result.deck.length).toBeGreaterThan(0);
    expect(result.discard).toEqual([drawn.drawn!.card]);
    expect(new Set(allIds(result)).size).toBe(104);
  });

  it("gives every other player exactly one final turn, scores once, and rotates the next starter", () => {
    let game = { ...ready(), turn: 2, starter: 3 };
    game.players = game.players.map((player, seat) => seat === 2 ? {
      ...player, cards: player.cards.map((cell, i) => ({ ...cell, faceUp: i !== 5 })),
    } : player);
    game = replaceCard(drawCard(game, "deck"), 5);
    expect(game.finalTurns).toEqual([3, 0, 1]);
    for (const seat of [3, 0, 1]) {
      expect(game.turn).toBe(seat);
      expect(game.phase).toBe("draw");
      game = discardDraw(drawCard(game, "deck"));
    }
    expect(game.phase).toBe("round-over");
    expect(game.history).toHaveLength(1);
    expect(game.players.every(player => player.cards.every(cell => cell.faceUp))).toBe(true);
    const next = nextHole(game);
    expect(next.hole).toBe(2);
    expect(next.starter).toBe(0);
    expect(next.players.map(player => player.score)).toEqual(game.history[0]);
    expect(next.history).toEqual(game.history);
  });

  it("scores pairs, twos and both adjacent blocks, with one bonus for six matching cards", () => {
    expect(["A", "2", "3", "J", "Q", "K"].map(rank => cardValue(rank as Rank))).toEqual([1, -2, 3, 10, 10, 0]);
    expect(scoreGrid(grid(["2", "A", "K", "2", "3", "Q"]))).toBe(10);
    expect(scoreGrid(grid(["8", "8", "K", "8", "8", "3"]))).toBe(-17);
    expect(scoreGrid(grid(["K", "8", "8", "3", "8", "8"]))).toBe(-17);
    expect(scoreGrid(grid(["8", "K", "8", "8", "3", "8"]))).toBe(3);
    expect(scoreGrid(grid(["2", "K", "2", "2", "K", "2"]))).toBe(-8);
    expect(scoreGrid(grid(["2", "2", "K", "2", "2", "K"]))).toBe(-28);
    expect(scoreGrid(grid(["K", "2", "2", "K", "2", "2"]))).toBe(-28);
    expect(scoreGrid(grid(["2", "2", "K", "2", "2", "3"]))).toBe(-25);
    expect(scoreGrid(grid(["2", "2", "2", "2", "2", "2"]))).toBe(-32);
  });

  it.each([0, 1, 2])("scores paired twos as −4 in column %i while other pairs cancel", column => {
    const cards = grid(["K", "A", "Q", "K", "A", "Q"]);
    cards[column].card.rank = "2";
    cards[column + 3].card.rank = "2";
    expect(scoreGrid(cards)).toBe(-4);
  });

  it.each([2, 3, 4, 5, 6].flatMap(count => Array.from({ length: count }, (_, wentOut) =>
    [1, 9].map(hole => ({ count, wentOut, hole }))
  )).flat())("adds one going-out penalty after the last turn for seat $wentOut of $count on hole $hole", ({ count, wentOut, hole }) => {
    const previous = Array.from({ length: count }, (_, seat) => seat === wentOut ? -20 : 40);
    let game: Game = { ...createGame(count), phase: "draw", turn: wentOut, hole,
      history: Array.from({ length: hole - 1 }, () => [...previous]),
      discard: [{ id: "out-draw", rank: "Q", suit: "H" }],
    };
    game.players = game.players.map((player, seat) => ({ ...player, score: previous[seat] * (hole - 1),
      cards: grid(seat === wentOut ? ["J", "Q", "J", "Q", "J", "Q"] : ["K", "A", "3", "K", "A", "3"])
        .map((cell, index) => ({ ...cell, faceUp: index !== 5 })),
    }));
    const totals = game.players.map(player => player.score);
    game = replaceCard(drawCard(game, "discard"), 5);
    for (let i = 1; i < count; i++) {
      expect(game.turn).toBe((wentOut + i) % count);
      expect(game.history).toHaveLength(hole - 1);
      expect(game.players.map(player => player.score)).toEqual(totals);
      game = discardDraw(drawCard(game, "deck"));
    }
    const scores = Array.from({ length: count }, (_, seat) => seat === wentOut ? 70 : 0);
    expect(game.phase).toBe(hole === 9 ? "game-over" : "round-over");
    expect(game.history).toHaveLength(hole);
    expect(game.history.at(-1)).toEqual(scores);
    expect(game.players.map(player => player.score)).toEqual(totals.map((total, seat) => total + scores[seat]));
    expect(discardDraw(game)).toBe(game);
    expect(replaceCard(game, 5)).toBe(game);
    if (hole === 1) {
      const next = nextHole(game);
      expect(next.players.map(player => player.score)).toEqual(scores);
      expect(next.finalTurns).toBeNull();
    }
  });

  it.each<{ out: Rank[]; other: Rank[]; penalty: number }>([
    { out: ["K", "A", "3", "K", "A", "3"], other: ["K", "A", "3", "K", "A", "4"], penalty: 0 },
    { out: ["K", "A", "3", "K", "A", "4"], other: ["K", "A", "3", "K", "A", "4"], penalty: 0 },
    { out: ["8", "8", "K", "8", "8", "K"], other: ["8", "8", "2", "8", "8", "A"], penalty: 10 },
    { out: ["8", "8", "2", "8", "8", "A"], other: ["8", "8", "K", "8", "8", "K"], penalty: 0 },
  ])("compares hole scores, including ties and negative scores: $penalty penalty", ({ out, other, penalty }) => {
    let game: Game = { ...ready(3), turn: 1, discard: [{ id: "out-draw", rank: out[5], suit: "H" }] };
    game.players = game.players.map((player, seat) => ({ ...player,
      cards: grid(seat === 1 ? out : other).map((cell, index) => ({ ...cell, faceUp: index !== 5 })),
    }));
    game = replaceCard(drawCard(game, "discard"), 5);
    game = discardDraw(drawCard(game, "deck"));
    game = discardDraw(drawCard(game, "deck"));
    expect(game.history[0]).toEqual([scoreGrid(grid(other)), scoreGrid(grid(out)) + penalty, scoreGrid(grid(other))]);
  });

  it("waits for a lower score made on the very last turn even when another player also turns up all six cards", () => {
    let game: Game = { ...ready(3), turn: 0, discard: [{ id: "out-draw", rank: "K", suit: "H" }] };
    game.players = game.players.map(player => ({ ...player,
      cards: grid(["8", "8", "A", "8", "8", "K"]).map((cell, index) => ({ ...cell, faceUp: index !== 5 })),
    }));
    game = replaceCard(drawCard(game, "discard"), 5);
    expect(game.finalTurns).toEqual([1, 2]);
    game = replaceCard(drawCard(game, "discard"), 5);
    expect(game.finalTurns).toEqual([2]);
    expect(game.history).toEqual([]);
    expect(game.players.every(player => player.score === 0)).toBe(true);
    game = { ...game, deck: [...game.deck, { id: "last-draw", rank: "2", suit: "D" }] };
    game = replaceCard(drawCard(game, "deck"), 5);
    expect(game.history[0]).toEqual([-9, -19, -21]);
  });

  it("keeps bot choices independent of hidden card identities", () => {
    const game = ready();
    const changed = { ...game, players: game.players.map(player => ({ ...player,
      cards: player.cards.map(cell => cell.faceUp ? cell : { ...cell, card: { ...cell.card, rank: "K" as const } }),
    })) };
    expect(botSource(game)).toBe(botSource(changed));
    expect(replacementIndex(game, game.discard[0])).toBe(replacementIndex(changed, changed.discard[0]));
  });

  it("protects a completed four-card block of twos rather than breaking it for a king", () => {
    const game = ready(2);
    game.players[game.turn].cards = grid(["2", "2", "K", "2", "2", "K"]);
    const king = { id: "test-king", rank: "K" as const, suit: "H" as const };
    game.discard = [king];
    expect(scoreGrid(game.players[game.turn].cards)).toBe(-28);
    expect(replacementIndex(game, king)).toBe(-1);
    expect(botSource(game)).toBe("deck");
  });

  it("completes and preserves paired twos for their −4 score", () => {
    const game = ready(2);
    game.players[game.turn].cards = grid(["2", "A", "3", "K", "A", "3"]);
    const two = { id: "test-two", rank: "2" as const, suit: "H" as const };
    game.discard = [two];
    expect(replacementIndex(game, two)).toBe(3);
    expect(botSource(game)).toBe("discard");

    game.players[game.turn].cards[3].card = two;
    const king = { id: "test-king", rank: "K" as const, suit: "H" as const };
    game.discard = [king];
    expect(replacementIndex(game, king)).toBe(-1);
    expect(botSource(game)).toBe("deck");
  });

  it("completes an adjacent four-card block when it improves the board", () => {
    const game = ready(2);
    game.players[game.turn].cards = grid(["2", "2", "9", "2", "K", "10"]);
    const two = { id: "test-two", rank: "2" as const, suit: "H" as const };
    game.discard = [two];
    expect(replacementIndex(game, two)).toBe(4);
    expect(botSource(game)).toBe("discard");
  });

  it("uses a required discard draw in the least harmful slot without breaking a bonus block", () => {
    const game = ready(2);
    game.players[game.turn].cards = grid(["2", "2", "K", "2", "2", "K"]);
    const king = { id: "test-king", rank: "K" as const, suit: "H" as const };
    game.deck = [];
    game.discard = [king];
    expect(botSource(game)).toBe("discard");
    const drawn = drawCard(game, "discard");
    const index = replacementIndex(drawn, king);
    expect(index).toBe(2);
    expect(scoreGrid(replaceCard(drawn, index).players[game.turn].cards)).toBe(-28);
  });

  it.each([2, 3, 4, 5, 6])("plays all nine holes against real bot decisions for %i players without losing cards or scoring twice", count => {
    vi.spyOn(Math, "random").mockReturnValue(0.37);
    let game = createGame(count);
    const firstStarter = game.starter;
    for (let hole = 1; hole <= 9; hole++) {
      expect(game.starter).toBe((firstStarter + hole - 1) % count);
      game = startPlay(turnUpDeck(openOpponents(openCard(openCard(game, 0), 4))));
      for (let turn = 0; game.phase === "draw" && turn < 100; turn++) {
        const human = game.turn === 0;
        const source = human ? "deck" : botSource(game);
        game = drawCard(game, source);
        const index = human ? game.players[0].cards.findIndex(cell => !cell.faceUp) : replacementIndex(game, game.drawn!.card);
        game = index >= 0 ? replaceCard(game, index) : discardDraw(game);
        expect(new Set(allIds(game)).size).toBe(104);
      }
      expect(game.history).toHaveLength(hole);
      expect(game.phase).toBe(hole === 9 ? "game-over" : "round-over");
      expect(replaceCard(game, 0)).toBe(game);
      if (hole < 9) game = nextHole(game);
    }
    expect(game.players.map(player => player.score)).toEqual(
      Array.from({ length: count }, (_, seat) => game.history.reduce((total, scores) => total + scores[seat], 0))
    );
  });
});
