import { expect, it } from "vitest";
import { completedHoleRecords, createGame, discardDraw, drawCard, nextHole, type Game, type Rank } from "./engine";

function finish(game = createGame(2)): Game {
  const hands: Rank[][] = [["K", "A", "K", "K", "A", "3"], ["K", "A", "3", "K", "A", "4"]];
  const last: Game = { ...game, phase: "draw", turn: 0, finalTurns: [0],
    players: game.players.map((player, seat) => ({ ...player,
      cards: hands[seat].map((rank, index) => ({ faceUp: seat === 1, card: { id: `${game.hole}-${seat}-${index}`, rank, suit: "H" } })),
    })),
  };
  return discardDraw(drawCard(last, "deck"));
}

it("records the real final cards and the going-out penalty as soon as a hole finishes", () => {
  const started = createGame(2);
  expect(completedHoleRecords(started)).toEqual([]);
  const finished = finish(started);
  expect(finished.holeRecords).toHaveLength(1);
  const record = finished.holeRecords![0];
  expect(record).toMatchObject({ hole: 1, wentOut: 1, players: [{ score: 3 }, { score: 17, penalty: 10 }] });
  expect(record.players.map(player => player.cards)).toEqual(finished.players.map(player => player.cards.map(cell => cell.card)));
  expect(record.players[0].cards[0]).not.toBe(finished.players[0].cards[0].card);
  expect(completedHoleRecords(finished)).toHaveLength(1);
  expect(started.holeRecords).toEqual([]);
});

it("preserves previous boards across deals, appends once per hole and starts a rematch empty", () => {
  const first = finish();
  const original = structuredClone(first.holeRecords);
  const second = nextHole(first);
  expect(completedHoleRecords(second)).toEqual(original);
  expect(second.players.every(player => player.cards.every(cell => !cell.faceUp))).toBe(true);
  const finished = finish(second);
  expect(finished.holeRecords?.map(record => record.hole)).toEqual([1, 2]);
  expect(finished.holeRecords![0]).toEqual(original![0]);
  expect(finished.holeRecords![1].players[0].cards[0].id).toBe("2-0-0");
  expect(createGame(2).holeRecords).toEqual([]);
});

it("recovers only the current completed board from an older save without inventing prior cards", () => {
  const old = { ...finish(), holeRecords: undefined, hole: 4, history: [[1, 2], [3, 4], [5, 6], [3, 17]] };
  expect(completedHoleRecords(old).map(record => record.hole)).toEqual([4]);
  expect(nextHole(old).holeRecords).toEqual(completedHoleRecords(old));
  expect(completedHoleRecords({ ...old, phase: "draw" })).toEqual([]);
});

it("includes hole nine in the record before the final results are shown", () => {
  const finished = finish({ ...createGame(2), hole: 9 });
  expect(finished.phase).toBe("game-over");
  expect(finished.holeRecords?.map(record => record.hole)).toEqual([9]);
  expect(finished.holeRecords![0].players[1].score).toBe(17);
});
