import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { TableMotion } from "./useGolfTable";
import type { RoomState } from "@/lib/golfApi";
import { roomFixture } from "@/test/golfFixtures";
import { projectTable, useServerGolfTable } from "./useServerGolfTable";

const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("@/context/SoundContext", () => ({ useSound: () => sound }));
beforeEach(() => sound.play.mockClear());
const command = vi.fn(async () => true);

it("keeps server record rosters intact when the current table has fewer players", () => {
  const state = roomFixture(2, 1);
  state.holeRecords = [{ hole: 1, wentOut: 2, players: ["Friend 1", "Departed friend", "Friend 0"].map((name, seat) => ({
    name, isBot: false, icon: "cat", score: seat + 1,
    cards: Array.from({ length: 6 }, (_, index) => ({ id: `old-${seat}-${index}`, rank: "A", suit: "S" })),
  })) }];
  const projected = projectTable(state);
  expect(projected.participants.map(person => person.name)).toEqual(["Friend 1", "Friend 0"]);
  expect(projected.game.holeRecords).toEqual(state.holeRecords);
  expect(projected.game.holeRecords![0].players[1].name).toBe("Departed friend");
  expect(projected.game.holeRecords![0].wentOut).toBe(2);
});

function moving(state: RoomState, kind: TableMotion["kind"]): RoomState {
  return { ...state, revision: state.revision + 1, motion: {
    kind, card: { id: "moving-card", rank: "Q", suit: "H" }, from: "drawn-0", to: "discard",
    flip: false, seat: 0, index: -1, source: "deck",
  } };
}

// Flask sorts HTTP JSON keys, including nested card keys; Socket.IO keeps insertion order.
function httpOrder(state: RoomState): RoomState {
  return JSON.parse(JSON.stringify(state, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value,
  ));
}

const deliveries = (["draw", "toss", "discard", "place", "upcard"] as const).flatMap(kind =>
  [false, true].map(httpFirst => ({ kind, httpFirst })),
);

it.each(deliveries)("plays $kind once across HTTP and socket copies (HTTP first: $httpFirst)", ({ kind, httpFirst }) => {
  const initial = roomFixture();
  const socketState = moving(initial, kind);
  const httpState = httpOrder(socketState);
  expect(httpState.motion).toEqual(socketState.motion);
  expect(JSON.stringify(httpState.motion)).not.toBe(JSON.stringify(socketState.motion));
  const view = renderHook(({ state }) => useServerGolfTable(state, command, false), { initialProps: { state: initial } });
  const [first, second] = httpFirst ? [httpState, socketState] : [socketState, httpState];
  view.rerender({ state: first });
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("slide");
  view.rerender({ state: second });
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("slide");
});

it("keeps an unchanged movement silent when unrelated updates advance the room revision", () => {
  const initial = roomFixture();
  const next = moving(initial, "toss");
  const view = renderHook(({ state }) => useServerGolfTable(state, command, false), { initialProps: { state: initial } });
  view.rerender({ state: next });
  view.rerender({ state: httpOrder({ ...next, revision: next.revision + 1, idleWarning: true }) });
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("slide");
});

it("plays for both flights of a replacement while ignoring duplicate copies of each", () => {
  const initial = roomFixture();
  const discard = moving(initial, "discard");
  const place: RoomState = { ...discard, revision: discard.revision + 1, motion: {
    ...discard.motion!, kind: "place", from: "drawn-0", to: "card-0-2", index: 2,
  } };
  const view = renderHook(({ state }) => useServerGolfTable(state, command, false), { initialProps: { state: initial } });
  for (const state of [discard, httpOrder(discard), place, httpOrder(place)]) view.rerender({ state });
  expect(sound.play.mock.calls).toEqual([["slide"], ["slide"]]);
});

it("plays again when a card starts another movement after the previous one finishes", () => {
  const initial = roomFixture();
  const next = moving(initial, "draw");
  const view = renderHook(({ state }) => useServerGolfTable(state, command, false), { initialProps: { state: initial } });
  view.rerender({ state: next });
  view.rerender({ state: { ...next, revision: next.revision + 1, motion: null } });
  view.rerender({ state: { ...next, revision: next.revision + 2 } });
  expect(sound.play.mock.calls).toEqual([["slide"], ["slide"]]);
});

it("does not replay an ongoing movement when restoring a table in Strict Mode", () => {
  const initial = moving(roomFixture(), "toss");
  const view = renderHook(({ state }) => useServerGolfTable(state, command, false), {
    initialProps: { state: initial }, wrapper: StrictMode,
  });
  view.rerender({ state: httpOrder(initial) });
  expect(sound.play).not.toHaveBeenCalled();
});

it("plays hole and game completion sounds once across duplicate updates", () => {
  const initial = roomFixture();
  const view = renderHook(({ state }) => useServerGolfTable(state, command, false), { initialProps: { state: initial } });
  const round: RoomState = { ...initial, revision: initial.revision + 1, game: { ...initial.game!, phase: "round-over" } };
  const hole: RoomState = { ...round, revision: round.revision + 1, game: { ...round.game!, hole: 2, phase: "opening" } };
  const finished: RoomState = { ...hole, revision: hole.revision + 1, game: { ...hole.game!, phase: "game-over" } };
  for (const state of [round, httpOrder(round), hole, httpOrder(hole), finished, httpOrder(finished)]) view.rerender({ state });
  expect(sound.play.mock.calls).toEqual([["round"], ["deal"], ["win"]]);
});
