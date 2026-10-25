import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createGame, type Game } from "@/game/engine";
import { readResults } from "@/lib/results";
import { useGameResults } from "./useGameResults";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
function finished(game: Game): Game {
  return { ...game, phase: "game-over", hole: 9, history: Array.from({ length: 9 }, () => [-1, 2]),
    players: game.players.map((player, seat) => ({ ...player, score: seat === 0 ? -9 : 18 })) };
}

it("waits for the initial account session and records each completed replay once", () => {
  auth.user = null; auth.loading = true;
  const game = createGame(2);
  const view = renderHook(({ game }) => useGameResults(game), { initialProps: { game } });
  auth.user = { id: "alice" }; auth.loading = false;
  view.rerender({ game });
  view.rerender({ game: finished(game) });
  view.rerender({ game: { ...finished(game) } });
  expect(readResults("alice")).toHaveLength(1);
  const replay = createGame(2);
  view.rerender({ game: replay });
  view.rerender({ game: finished(replay) });
  expect(readResults("alice")).toHaveLength(2);
});

it("does not credit guest games or transfer a started game after an account switch", () => {
  auth.user = null; auth.loading = false;
  const game = createGame(2);
  const view = renderHook(({ game }) => useGameResults(game), { initialProps: { game } });
  auth.user = { id: "alice" };
  view.rerender({ game: finished(game) });
  expect(readResults("alice")).toEqual([]);
  const signedInGame = createGame(2);
  view.rerender({ game: signedInGame });
  auth.user = { id: "bob" };
  view.rerender({ game: signedInGame });
  auth.user = { id: "alice" };
  view.rerender({ game: finished(signedInGame) });
  expect(readResults("alice")).toEqual([]);
  expect(readResults("bob")).toEqual([]);
});

it("shows a failed save and retries without duplicating the result", () => {
  auth.user = { id: "alice" }; auth.loading = false;
  const game = createGame(2);
  const view = renderHook(({ game }) => useGameResults(game), { initialProps: { game } });
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
  view.rerender({ game: finished(game) });
  expect(view.result.current.error).toContain("couldn’t be saved");
  act(() => view.result.current.retry());
  expect(view.result.current.error).toBe("");
  expect(readResults("alice")).toHaveLength(1);
});
