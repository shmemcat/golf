import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Providers } from "@/App";
import { GolfTableView } from "./GamePage";
import { FLIP_MS, type useGolfTable } from "@/hooks/useGolfTable";
import { createGame, discardDraw, drawCard, nextHole, type Game } from "@/game/engine";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: null, csrf_token: "test" }))));
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
});
afterEach(() => vi.useRealTimers());

const noop = () => {};
function tableView(game: Game) {
  const table: ReturnType<typeof useGolfTable> = { game, stage: "playing", motion: null, pickerSeat: 0,
    canReveal: () => false, canDraw: false, canReplace: false,
    reveal: noop, draw: noop, replace: noop, toss: noop, advance: noop, restart: noop,
  };
  return <MemoryRouter><Providers><GolfTableView count={game.players.length} selection="backing" table={table} /></Providers></MemoryRouter>;
}
const finish = (game = createGame(2)) => discardDraw(drawCard({ ...game, phase: "draw", turn: 0, finalTurns: [0] }, "deck"));
const openRecord = (hole: number) => fireEvent.click(screen.getByRole("button", { name: `Hole ${hole} of 9. View hole record` }));
const ranks = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll(".golf-record-hand .card-art > text"), element => element.textContent);

it("opens an empty record on hole one without exposing the unfinished cards", async () => {
  const view = render(tableView(createGame(2)));
  await act(async () => {});
  openRecord(1);
  expect(screen.getByRole("dialog", { name: "Your round starts here" })).toBeVisible();
  expect(within(screen.getByRole("dialog")).queryAllByRole("img")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount();
});

it.each([1, 9])("immediately includes finished hole %i and can open it after hiding the results", async hole => {
  const finished = finish({ ...createGame(2), hole });
  const view = render(tableView(finished));
  await act(async () => {});
  openRecord(hole);
  expect(ranks(screen.getByRole("dialog"))).toEqual(finished.players.flatMap(player => player.cards.map(cell => cell.card.rank)));
  act(() => { vi.advanceTimersByTime(FLIP_MS + 4000); });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("dialog", { name: `Hole ${hole} / 9` })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: `Show ${hole === 9 ? "game" : "hole"} results` }));
  expect(screen.getByRole("dialog")).toHaveAttribute("id", hole === 9 ? "golf-game-results" : "golf-hole-results");
  fireEvent.click(screen.getByRole("button", { name: `Hide ${hole === 9 ? "game" : "hole"} results` }));
  openRecord(hole);
  expect(screen.getByRole("dialog", { name: `Hole ${hole} / 9` })).toBeVisible();
  expect(ranks(screen.getByRole("dialog"))).toEqual(finished.players.flatMap(player => player.cards.map(cell => cell.card.rank)));
  view.unmount();
});

it("browses real historical hands with arrows, dots and keys after advancing and refreshing", async () => {
  const first = finish();
  const second = finish(nextHole(first));
  const view = render(tableView(structuredClone(nextHole(second))));
  await act(async () => {});
  openRecord(3);
  expect(screen.getByRole("dialog", { name: "Hole 2 / 9" })).toBeVisible();
  expect(ranks(screen.getByRole("dialog"))).toEqual(second.players.flatMap(player => player.cards.map(cell => cell.card.rank)));
  expect(screen.queryByRole("button", { name: "View hole 3" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Previous hole" }));
  expect(ranks(screen.getByRole("dialog"))).toEqual(first.players.flatMap(player => player.cards.map(cell => cell.card.rank)));
  expect(screen.getByRole("button", { name: "Previous hole" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "View hole 2" }));
  expect(screen.getByRole("button", { name: "View hole 2" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Home" });
  expect(screen.getByRole("dialog", { name: "Hole 1 / 9" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
  expect(screen.getByRole("dialog", { name: "Hole 2 / 9" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
  view.rerender(tableView(createGame(2)));
  openRecord(1);
  expect(screen.getByRole("dialog", { name: "Your round starts here" })).toBeVisible();
  view.unmount();
});

it("closes outside or on Escape, restores focus and leaves clicks on cards inside the dialog", async () => {
  const view = render(tableView(finish()));
  await act(async () => {});
  const trigger = screen.getByRole("button", { name: "Hole 1 of 9. View hole record" });
  trigger.focus();
  openRecord(1);
  const dialog = screen.getByRole("dialog");
  const card = within(dialog).getAllByRole("img")[0];
  fireEvent.pointerDown(card);
  fireEvent.click(card);
  expect(dialog).toBeVisible();
  fireEvent.pointerDown(dialog);
  fireEvent.click(dialog);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  openRecord(1);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).not.toBe("hidden");
  view.unmount();
});
