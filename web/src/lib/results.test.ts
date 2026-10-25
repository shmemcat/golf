import { expect, it, vi } from "vitest";
import { createGame, nextHole, type Game } from "@/game/engine";
import { isWin, readResults, recordResult, summarizeResults } from "./results";

function finishedGame(scores = [-9, 18]): Game {
  return {
    ...createGame(scores.length), phase: "game-over", hole: 9,
    players: createGame(scores.length).players.map((player, seat) => ({ ...player, score: scores[seat] })),
    history: Array.from({ length: 9 }, () => scores.map(score => score / 9)),
  };
}

it("records a nine-hole game once, isolates accounts, and uses the lowest score including ties", () => {
  const game = finishedGame([-9, -9]);
  expect(recordResult(game, "alice")).toBe(true);
  recordResult(game, "alice");
  expect(readResults("alice")).toHaveLength(1);
  expect(readResults("bob")).toEqual([]);
  expect(isWin(readResults("alice")[0])).toBe(true);
  recordResult(finishedGame([18, -9]), "alice");
  expect(summarizeResults(readResults("alice"))).toEqual({
    played: 2, won: 1, winRate: "50%", holesPlayed: 18,
    bestScore: -9, bestHole: -1, averageScore: "4.5", negativeHoles: 9,
  });
});

it("ignores unfinished games and rejects broken local records without breaking the profile", () => {
  recordResult(createGame(2), "alice");
  expect(readResults("alice")).toEqual([]);
  localStorage.setItem("golf.results.v1:alice", JSON.stringify([null, { id: "bad" }, { ...finishedGame(), holes: [] }]));
  expect(readResults("alice")).toEqual([]);
  localStorage.setItem("golf.results.v1:alice", "broken json");
  expect(readResults("alice")).toEqual([]);
  expect(summarizeResults([]).bestScore).toBe("—");
});

it("preserves hole and game totals that include going-out penalties", () => {
  const game = finishedGame([630, 0]);
  expect(recordResult(game, "alice")).toBe(true);
  expect(readResults("alice")[0]).toMatchObject({ scores: [630, 0], holes: Array(9).fill(70) });
  expect(summarizeResults(readResults("alice"))).toMatchObject({ bestScore: 630, bestHole: 70 });
  expect(recordResult(finishedGame([639, 0]), "alice")).toBe(false);
  expect(recordResult(finishedGame([0, 639]), "alice")).toBe(false);
});

it("reports a storage failure so the game can offer a retry", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
  expect(recordResult(finishedGame(), "alice")).toBe(false);
  expect(recordResult(finishedGame(), "alice")).toBe(true);
});

it("keeps a game identity across holes and gives a replay a new identity", () => {
  const game = createGame(3);
  expect(nextHole({ ...game, phase: "round-over" }).id).toBe(game.id);
  expect(createGame(3).id).not.toBe(game.id);
});
