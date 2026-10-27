import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createGame, discardDraw, drawCard, openCard, openOpponents, startPlay, turnUpDeck, type Game } from "@/game/engine";
import { readLocalGame, saveLocalGame, type LocalGame } from "@/lib/localGame";
import { DEAL_MS, FLIP_MS, FLIGHT_MS, useGolfTable, type Stage } from "./useGolfTable";

vi.mock("@/context/SoundContext", () => ({ useSound: () => ({ play: vi.fn() }) }));
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, "random").mockReturnValue(0); });
afterEach(() => vi.useRealTimers());
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function save(game: Game, stage: Stage = "playing", overrides: Partial<LocalGame> = {}) {
  const snapshot: LocalGame = { game, stage, motion: null, pickerTick: 0, openingBusy: false, ...overrides };
  saveLocalGame(snapshot);
  return snapshot;
}
function started() {
  return startPlay(turnUpDeck(openOpponents(openCard(openCard(createGame(4), 0), 4))));
}
const cards = (game: Game) => [...game.deck, ...game.discard, ...game.players.flatMap(p => p.cards.map(c => c.card)), ...(game.drawn ? [game.drawn.card] : [])];

it.each<Stage>(["dealing", "opening", "opponents", "upcard", "picking", "announcing", "playing"])(
  "restores the saved %s stage and the original game identity", stage => {
    const game = stage === "playing" ? started() : createGame(4);
    const snapshot = save(game, stage, { pickerTick: 3 });
    const view = renderHook(() => useGolfTable(4, true));
    expect(view.result.current.game).toEqual(snapshot.game);
    expect(view.result.current.stage).toBe(stage);
    expect(view.result.current.pickerSeat).toBe(3);
    view.unmount();
  }
);

it("saves the opening flip lock and resumes flipping without losing already revealed cards", () => {
  const first = renderHook(() => useGolfTable(3, true));
  tick(DEAL_MS);
  act(() => first.result.current.reveal(0));
  const id = first.result.current.game.id;
  expect(readLocalGame()?.openingBusy).toBe(true);
  first.unmount();
  const resumed = renderHook(() => useGolfTable(3, true));
  expect(resumed.result.current.game.id).toBe(id);
  expect(resumed.result.current.game.players[0].cards[0].faceUp).toBe(true);
  expect(resumed.result.current.canReveal(4)).toBe(false);
  tick(FLIP_MS);
  expect(resumed.result.current.canReveal(4)).toBe(true);
});

it.each(["draw", "discard", "place", "toss"] as const)("resumes a %s flight exactly once and keeps all 104 cards", kind => {
  save(started());
  const first = renderHook(() => useGolfTable(4, true));
  if (kind === "draw") act(() => first.result.current.draw("deck"));
  else {
    act(() => first.result.current.draw("deck"));
    tick(FLIGHT_MS);
    if (kind === "toss") act(() => first.result.current.toss());
    else {
      act(() => first.result.current.replace(2));
      if (kind === "place") tick(FLIGHT_MS);
    }
  }
  const snapshot = readLocalGame()!;
  expect(snapshot.motion?.kind).toBe(kind);
  first.unmount();
  const resumed = renderHook(() => useGolfTable(4, true));
  expect(resumed.result.current.game).toEqual(snapshot.game);
  expect(resumed.result.current.motion).toEqual(snapshot.motion);
  tick(FLIGHT_MS);
  if (kind === "discard") tick(FLIGHT_MS);
  expect(resumed.result.current.motion).toBeNull();
  const all = cards(resumed.result.current.game);
  expect(all).toHaveLength(104);
  expect(new Set(all.map(card => card.id)).size).toBe(104);
  expect(resumed.result.current.game.turn).toBe(kind === "draw" ? 0 : 1);
});

it("restores a drawn discard reserved for replacement", () => {
  const game = drawCard(started(), "discard");
  save(game);
  const view = renderHook(() => useGolfTable(4, true));
  expect(view.result.current.game.drawn).toEqual(game.drawn);
  expect(view.result.current.canReplace).toBe(true);
  act(() => view.result.current.toss());
  expect(view.result.current.motion).toBeNull();
});

it("restores a hole summary with its accumulated scores and advances to the next hole", () => {
  const game: Game = { ...started(), phase: "round-over", history: [[4, 5, 6, 7]] };
  game.players = game.players.map((player, seat) => ({ ...player, score: game.history[0][seat] }));
  save(game);
  const view = renderHook(() => useGolfTable(4, true));
  expect(view.result.current.game.history).toEqual(game.history);
  act(() => view.result.current.advance());
  expect(view.result.current.game.hole).toBe(2);
  expect(view.result.current.game.players.map(p => p.score)).toEqual([4, 5, 6, 7]);
});

it("clears a completed game and keeps preview tables from replacing a saved game", () => {
  const snapshot = save(started());
  const preview = renderHook(() => useGolfTable(6));
  tick(DEAL_MS);
  expect(readLocalGame()?.game.id).toBe(snapshot.game.id);
  preview.unmount();
  saveLocalGame({ ...snapshot, game: { ...snapshot.game, phase: "game-over" } });
  expect(readLocalGame()).toBeNull();
});

it("ignores invalid stored data and starts a usable table", () => {
  localStorage.setItem("golf.active-local.v1", JSON.stringify({ game: { players: [null, {}] }, stage: "playing" }));
  expect(readLocalGame()).toBeNull();
  const view = renderHook(() => useGolfTable(2, true));
  expect(view.result.current.game.players).toHaveLength(2);
  expect(view.result.current.stage).toBe("dealing");
});

it("restores completed card records after refreshing both the results and the next deal", () => {
  const finished = discardDraw(drawCard({ ...started(), phase: "draw", turn: 0, finalTurns: [0] }, "deck"));
  save(finished);
  const first = renderHook(() => useGolfTable(4, true));
  expect(first.result.current.game.holeRecords).toEqual(finished.holeRecords);
  act(() => first.result.current.advance());
  first.unmount();
  const resumed = renderHook(() => useGolfTable(4, true));
  expect(resumed.result.current.game.hole).toBe(2);
  expect(resumed.result.current.game.holeRecords).toEqual(finished.holeRecords);
  expect(readLocalGame()?.game.holeRecords).toEqual(finished.holeRecords);
});

it("rejects a saved record that contains a future hole or invalid final cards", () => {
  const finished = discardDraw(drawCard({ ...started(), phase: "draw", turn: 0, finalTurns: [0] }, "deck"));
  const invalid = structuredClone(finished);
  invalid.holeRecords![0].hole = 2;
  save(invalid);
  expect(readLocalGame()).toBeNull();
  invalid.holeRecords![0].hole = 1;
  invalid.holeRecords![0].players[0].cards[0].rank = "invalid" as never;
  save(invalid);
  expect(readLocalGame()).toBeNull();
});
