import { act, renderHook } from "@testing-library/react";
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

function turnFixture() {
  const state = roomFixture();
  state.game!.turn = state.mySeat;
  state.game!.discard = [{ id: "discard-top", rank: "2", suit: "H" }];
  return state;
}

function pickup(state: RoomState, source: "deck" | "discard"): RoomState {
  return { ...state, revision: state.revision + 1, motion: {
    kind: "draw", card: source === "deck" ? { id: "deck-top", rank: "A", suit: "S" } : state.game!.discard.at(-1)!,
    from: source, to: `drawn-${state.mySeat}`, flip: source === "deck", seat: state.mySeat, index: -1, source,
  } };
}

function pickupArrived(state: RoomState): RoomState {
  const { source, card } = state.motion!;
  return { ...state, revision: state.revision + 1, motion: null, game: {
    ...state.game!, phase: "replace", drawn: { card, source },
    deckCount: state.game!.deckCount - (source === "deck" ? 1 : 0),
    discard: source === "discard" ? state.game!.discard.slice(0, -1) : state.game!.discard,
  } };
}

it.each(["deck", "discard"] as const)("queues a replacement before the %s draw response and waits for its arrival", async source => {
  const initial = turnFixture();
  let finishDraw!: (ok: boolean) => void;
  const send = vi.fn((action: string, _detail?: Record<string, unknown>) => action === "draw"
    ? new Promise<boolean>(resolve => { finishDraw = resolve; }) : Promise.resolve(true));
  const view = renderHook(({ state, pending }) => useServerGolfTable(state, send, false, pending), {
    initialProps: { state: initial, pending: false }, wrapper: StrictMode,
  });
  act(() => {
    view.result.current.table.draw(source);
    view.result.current.table.replace(2);
    view.result.current.table.replace(3);
    view.result.current.table.toss();
    view.result.current.table.draw("deck");
  });
  expect(send.mock.calls).toEqual([["draw", { source }]]);
  expect(view.result.current.table.canReplace).toBe(false);
  const moving = pickup(initial, source);
  view.rerender({ state: moving, pending: true });
  await act(async () => { finishDraw(true); });
  view.rerender({ state: moving, pending: false });
  expect(send).toHaveBeenCalledTimes(1);
  const arrived = pickupArrived(moving);
  await act(async () => { view.rerender({ state: arrived, pending: false }); });
  expect(send.mock.calls).toEqual([["draw", { source }], ["replace", { index: 2 }]]);
  await act(async () => { view.rerender({ state: httpOrder({ ...arrived, revision: arrived.revision + 1 }), pending: false }); });
  expect(send).toHaveBeenCalledTimes(2);
});

it("queues a deck toss during a restored pickup while keeping a discard pickup reserved for replacement", async () => {
  const initial = turnFixture();
  const moving = pickup(initial, "deck");
  const send = vi.fn(async (_action: string, _detail?: Record<string, unknown>) => true);
  const view = renderHook(({ state }) => useServerGolfTable(state, send, false), { initialProps: { state: moving } });
  act(() => view.result.current.table.toss());
  expect(send).not.toHaveBeenCalled();
  await act(async () => { view.rerender({ state: pickupArrived(moving) }); });
  expect(send).toHaveBeenCalledExactlyOnceWith("toss", undefined);
  const discard = pickup(initial, "discard");
  view.rerender({ state: { ...discard, game: { ...discard.game!, hole: 2 } } });
  act(() => view.result.current.table.toss());
  expect(view.result.current.table.canReplace).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
});

it("drops a queued replacement after a failed draw and lets the player retry", async () => {
  const initial = turnFixture();
  let finish!: (ok: boolean) => void;
  const send = vi.fn((_action: string, _detail?: Record<string, unknown>) => new Promise<boolean>(resolve => { finish = resolve; }));
  const view = renderHook(() => useServerGolfTable(initial, send, false));
  act(() => { view.result.current.table.draw("deck"); view.result.current.table.replace(2); });
  await act(async () => { finish(false); });
  expect(send).toHaveBeenCalledTimes(1);
  expect(view.result.current.table.canDraw).toBe(true);
  expect(view.result.current.table.canReplace).toBe(false);
});

it.each(["disconnect", "turn", "hole", "card"])("cancels a queued move when its pickup is invalidated by %s", async reason => {
  const moving = pickup(turnFixture(), "deck");
  const send = vi.fn(async (_action: string, _detail?: Record<string, unknown>) => true);
  const view = renderHook(({ state, disabled }) => useServerGolfTable(state, send, disabled), {
    initialProps: { state: moving, disabled: false },
  });
  act(() => view.result.current.table.replace(2));
  const arrived = pickupArrived(moving);
  const changed = structuredClone(arrived);
  if (reason === "turn") changed.game!.turn = (changed.mySeat + 1) % changed.seats.length;
  if (reason === "hole") changed.game!.hole++;
  if (reason === "card") changed.game!.drawn!.card.id = "another-draw";
  await act(async () => { view.rerender({ state: changed, disabled: reason === "disconnect" }); });
  await act(async () => { view.rerender({ state: arrived, disabled: false }); });
  expect(send).not.toHaveBeenCalled();
  expect(view.result.current.table.canReplace).toBe(true);
});

it("clears both rapid selections when the first request fails so the player can retry", async () => {
  const initial = roomFixture();
  initial.stage = "opening";
  initial.game!.phase = "opening";
  let finish!: (ok: boolean) => void;
  const reveal = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const view = renderHook(() => useServerGolfTable(initial, reveal, false), { wrapper: StrictMode });
  act(() => {
    view.result.current.table.reveal(0);
    view.result.current.table.reveal(3);
    view.result.current.table.reveal(4);
    view.result.current.table.reveal(5);
  });
  expect(reveal).toHaveBeenCalledExactlyOnceWith("reveal", { index: 0 });
  expect(Array.from({ length: 6 }, (_, index) => view.result.current.table.canReveal(index))).toEqual(Array(6).fill(false));
  await act(async () => { finish(false); });
  expect(reveal).toHaveBeenCalledTimes(1);
  expect(view.result.current.table.canReveal(0)).toBe(true);
  expect(view.result.current.table.canReveal(4)).toBe(true);
});

it("drops queued flips when the hole changes and keeps disconnected opening cards disabled", async () => {
  const initial = roomFixture();
  initial.stage = "opening";
  initial.game!.phase = "opening";
  let finish!: (ok: boolean) => void;
  const reveal = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const view = renderHook(({ state, disabled }) => useServerGolfTable(state, reveal, disabled), {
    initialProps: { state: initial, disabled: false },
  });
  act(() => { view.result.current.table.reveal(0); view.result.current.table.reveal(4); });
  const next = { ...initial, revision: initial.revision + 1, game: { ...initial.game!, hole: 2 } };
  view.rerender({ state: next, disabled: false });
  act(() => view.result.current.table.reveal(1));
  await act(async () => { finish(true); });
  expect(reveal.mock.calls).toEqual([["reveal", { index: 0 }], ["reveal", { index: 1 }]]);
  await act(async () => { finish(false); });
  expect(view.result.current.table.canReveal(0)).toBe(true);
  view.rerender({ state: next, disabled: true });
  expect(view.result.current.table.canReveal(0)).toBe(false);
  act(() => view.result.current.table.reveal(0));
  expect(reveal).toHaveBeenCalledTimes(2);
});

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
