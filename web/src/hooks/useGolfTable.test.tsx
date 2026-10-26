import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BOT_DRAW_MS, DEAL_MS, FLIGHT_MS, FLIP_MS, OPPONENTS_MS, useGolfTable } from "./useGolfTable";
import { createGame, type Rank } from "@/game/engine";
import * as localGame from "@/lib/localGame";

const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("@/context/SoundContext", () => ({ useSound: () => sound }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  sound.play.mockClear();
});
afterEach(() => vi.useRealTimers());
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function openTable() {
  const view = renderHook(() => useGolfTable(4));
  tick(DEAL_MS);
  act(() => view.result.current.reveal(0));
  tick(FLIP_MS);
  act(() => view.result.current.reveal(4));
  return view;
}
function playTable() {
  const view = openTable();
  for (let step = 0; step < 30 && view.result.current.stage !== "playing"; step++) tick(300);
  expect(view.result.current.stage).toBe("playing");
  return view;
}

it("holds input for the deal, restricts the opening row and column, then flips every bot together before the upcard and picker", () => {
  const view = renderHook(() => useGolfTable(6));
  expect(view.result.current.canReveal(0)).toBe(false);
  expect(view.result.current.canDraw).toBe(false);
  tick(DEAL_MS);
  expect(sound.play).toHaveBeenCalledWith("deal");
  act(() => view.result.current.reveal(0));
  expect(view.result.current.canReveal(1)).toBe(false);
  tick(FLIP_MS);
  expect(view.result.current.canReveal(3)).toBe(false);
  expect([0, 1, 2, 3].every(index => !view.result.current.canReveal(index))).toBe(true);
  expect([4, 5].every(index => view.result.current.canReveal(index))).toBe(true);
  expect(view.result.current.game.players.slice(1).every(player => player.cards.every(cell => !cell.faceUp))).toBe(true);
  act(() => view.result.current.reveal(4));
  tick(FLIP_MS);
  expect(view.result.current.stage).toBe("opponents");
  expect(view.result.current.game.players.every(player => player.cards.filter(cell => cell.faceUp).length === 2)).toBe(true);
  expect(view.result.current.game.discard).toHaveLength(0);
  tick(OPPONENTS_MS);
  expect(view.result.current.motion?.kind).toBe("upcard");
  tick(FLIGHT_MS);
  expect(view.result.current.game.discard).toHaveLength(1);
  expect(view.result.current.stage).toBe("picking");
  expect(view.result.current.canDraw).toBe(false);
  for (let step = 0; step < 30 && view.result.current.stage !== "playing"; step++) tick(300);
  expect(view.result.current.game.turn).toBe(0);
  expect(view.result.current.canDraw).toBe(true);
  expect(sound.play).toHaveBeenCalledWith("start");
});

it("animates a draw to the dock, discards the old card first, then places the new one and permits the bot turn", () => {
  const view = playTable();
  const original = view.result.current.game.players[0].cards[2].card;
  act(() => view.result.current.draw("deck"));
  expect(view.result.current.motion?.to).toBe("drawn-0");
  expect(view.result.current.canReplace).toBe(false);
  tick(FLIGHT_MS);
  const drawn = view.result.current.game.drawn!.card;
  expect(view.result.current.canReplace).toBe(true);
  act(() => view.result.current.replace(2));
  expect(view.result.current.motion?.card).toBe(original);
  expect(view.result.current.motion?.to).toBe("discard");
  expect(view.result.current.canReplace).toBe(false);
  tick(FLIGHT_MS);
  expect(view.result.current.motion?.kind).toBe("place");
  expect(view.result.current.motion?.card).toBe(drawn);
  expect(view.result.current.game.turn).toBe(0);
  tick(FLIGHT_MS);
  expect(view.result.current.game.players[0].cards[2]).toEqual({ card: drawn, faceUp: true });
  expect(view.result.current.game.discard.at(-1)).toBe(original);
  expect(view.result.current.game.turn).toBe(1);
  tick(BOT_DRAW_MS);
  expect(view.result.current.motion?.kind).toBe("draw");
  expect(view.result.current.motion?.to).toBe("drawn-1");
});

it("discards an unwanted deck draw without exposing a tableau card and cleans up pending timers on leave", () => {
  const view = playTable();
  act(() => view.result.current.draw("deck"));
  tick(FLIGHT_MS);
  const drawn = view.result.current.game.drawn!.card;
  const cards = view.result.current.game.players[0].cards;
  act(() => view.result.current.toss());
  expect(view.result.current.motion?.kind).toBe("toss");
  tick(FLIGHT_MS);
  expect(view.result.current.game.players[0].cards).toBe(cards);
  expect(view.result.current.game.discard.at(-1)).toBe(drawn);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([1, 2, 3, 4, 5])("uses the named bot's strategy when resuming guest seat %i", seat => {
  const game = createGame(6);
  game.turn = seat;
  game.phase = "draw";
  game.players.forEach((player, index) => {
    const ranks: (Rank | null)[] = index === seat ? ["9", "2", "K", "9", "2", null] : ["Q", "J", null, null, "K", null];
    player.cards = ranks.map((rank, i) => ({ faceUp: rank !== null, card: { id: `${index}-${i}`, rank: rank ?? "Q", suit: "S" } }));
  });
  game.deck = [{ id: "deck-nine", rank: "9", suit: "H" }];
  game.discard = [{ id: "discard-nine", rank: "9", suit: "C" }];
  vi.spyOn(localGame, "readLocalGame").mockReturnValue({ game, stage: "playing", motion: null, pickerTick: 0, openingBusy: false });
  vi.spyOn(localGame, "saveLocalGame").mockImplementation(() => {});
  const view = renderHook(() => useGolfTable(6, true));
  tick(BOT_DRAW_MS);
  expect(view.result.current.motion?.source).toBe(seat === 3 ? "discard" : "deck");
  tick(FLIGHT_MS);
  tick(800);
  expect(view.result.current.motion?.kind).toBe(seat === 3 ? "discard" : "toss");
  expect(view.result.current.motion?.index).toBe(seat === 3 ? 1 : -1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("finishes the final turns, then deals a fresh hole and announces the clockwise starter without a second picker", () => {
  const view = playTable();
  for (const index of [1, 2, 3, 5]) {
    for (let step = 0; step < 100 && !view.result.current.canDraw; step++) tick(300);
    expect(view.result.current.canDraw).toBe(true);
    act(() => view.result.current.draw("deck"));
    tick(FLIGHT_MS);
    act(() => view.result.current.replace(index));
    tick(FLIGHT_MS);
    tick(FLIGHT_MS);
  }
  expect(view.result.current.game.finalTurns).not.toBeNull();
  for (let step = 0; step < 100 && view.result.current.game.phase !== "round-over"; step++) tick(300);
  expect(view.result.current.game.phase).toBe("round-over");
  expect(sound.play.mock.calls.filter(([name]) => name === "round")).toHaveLength(1);
  act(() => view.result.current.advance());
  expect(view.result.current.game.hole).toBe(2);
  expect(view.result.current.game.starter).toBe(1);
  expect(view.result.current.stage).toBe("dealing");
  tick(DEAL_MS);
  act(() => view.result.current.reveal(0));
  tick(FLIP_MS);
  act(() => view.result.current.reveal(4));
  tick(FLIP_MS);
  tick(OPPONENTS_MS);
  tick(FLIGHT_MS);
  expect(view.result.current.stage).toBe("announcing");
  tick(1100);
  expect(view.result.current.game.turn).toBe(1);
});

it.each([2, 3, 4, 5, 6])("finishes a complete animated nine-hole game with %i seats and restarts cleanly", count => {
  const view = renderHook(() => useGolfTable(count));
  try {
    for (let hole = 1; hole <= 9; hole++) {
      for (let step = 0; step < 2000; step++) {
        const table = view.result.current;
        if (table.game.phase === "round-over" || table.game.phase === "game-over") break;
        const opening = [0, 4].find(index => table.canReveal(index));
        if (opening !== undefined) act(() => table.reveal(opening));
        else if (table.canDraw) act(() => table.draw("deck"));
        else if (table.canReplace) {
          const hidden = table.game.players[0].cards.findIndex(cell => !cell.faceUp);
          act(() => hidden >= 0 ? table.replace(hidden) : table.toss());
        } else {
          expect(vi.getTimerCount()).toBeGreaterThan(0);
          act(() => { vi.advanceTimersToNextTimer(); });
        }
      }
      const game = view.result.current.game;
      expect(game.hole).toBe(hole);
      expect(game.history).toHaveLength(hole);
      expect(game.phase).toBe(hole === 9 ? "game-over" : "round-over");
      expect(game.drawn).toBeNull();
      expect(game.players.every(player => player.cards.every(cell => cell.faceUp))).toBe(true);
      game.players.forEach((player, seat) => expect(player.score).toBe(game.history.reduce((sum, scores) => sum + scores[seat], 0)));
      if (hole < 9) act(() => view.result.current.advance());
    }
    expect(sound.play.mock.calls.filter(([name]) => name === "round")).toHaveLength(8);
    expect(sound.play.mock.calls.filter(([name]) => name === "win")).toHaveLength(1);
    act(() => view.result.current.restart());
    expect(view.result.current.stage).toBe("dealing");
    expect(view.result.current.game.hole).toBe(1);
    expect(view.result.current.game.history).toEqual([]);
    expect(view.result.current.game.players).toHaveLength(count);
    expect(view.result.current.game.players.every(player => player.score === 0 && player.cards.every(cell => !cell.faceUp))).toBe(true);
  } finally {
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  }
});
