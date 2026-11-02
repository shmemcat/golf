import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { App, Providers } from "@/App";
import { createGame } from "@/game/engine";
import { FLIGHT_MS, FLIP_MS, type useGolfTable } from "@/hooks/useGolfTable";
import GamePage, { GolfTableView } from "./GamePage";

type Table = ReturnType<typeof useGolfTable>;
const noop = () => {};
function sample(count = 4, turn = 1): Table {
  return {
    game: { ...createGame(count), phase: "draw", turn }, stage: "playing", motion: null, pickerSeat: 0,
    canReveal: () => false, canDraw: turn === 0, canReplace: false,
    reveal: noop, draw: vi.fn(), replace: noop, toss: noop, advance: noop, restart: noop,
  };
}
const view = (table: Table) => <MemoryRouter><Providers><GolfTableView count={table.game.players.length} selection="backing" table={table} /></Providers></MemoryRouter>;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(JSON.stringify(path === "/api/golf/active" ? { rooms: [] } : { user: null, csrf_token: "test" }))));
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query.includes("max-width"), addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  })));
});

it.each([2, 3, 4, 5, 6])("starts the approved %i-player mobile table from Create Game", async count => {
  const result = render(<MemoryRouter initialEntries={["/game/create"]}><Providers><App /></Providers></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: `${count} Players`, exact: true }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Create Game", exact: true })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create Game", exact: true }));
  expect(await screen.findByRole("main", { name: `${count}-player Golf table` })).toBeInTheDocument();
  const shell = result.container.querySelector(".golf-game-shell");
  expect(shell).toHaveAttribute("data-draw-layout", "beside");
  expect(shell).toHaveAttribute("data-mobile-layout", count <= 3 ? "overview" : "cycle");
  const follow = screen.queryByRole("button", { name: /Auto-follow/ });
  if (count >= 4) expect(follow).toHaveAttribute("aria-pressed", "true");
  else expect(follow).not.toBeInTheDocument();
});

it("uses the approved layout on the play route even when an old study link requests another layout", async () => {
  const result = render(<MemoryRouter initialEntries={["/game/single?players=3&drawLayout=piles"]}><Providers><GamePage /></Providers></MemoryRouter>);
  await screen.findByRole("main", { name: "3-player Golf table" });
  expect(result.container.querySelector(".golf-game-shell")).toHaveAttribute("data-draw-layout", "beside");
  expect(result.container.querySelector(".golf-shared-draw")).not.toBeInTheDocument();
});

it.each([2, 3, 4, 5, 6])("chooses the mobile layout for %i players and exposes only visible boards", count => {
  const result = render(view(sample(count)));
  expect(result.container.querySelector(".golf-game-shell")).toHaveAttribute("data-mobile-layout", count < 4 ? "overview" : "cycle");
  expect(result.container.querySelectorAll(".golf-seat")).toHaveLength(count);
  const seats = screen.getAllByRole("region").filter(e => e.classList.contains("golf-seat"));
  expect(seats).toHaveLength(count < 4 ? count : 1);
  if (count >= 4) expect(seats[0]).toHaveAccessibleName("Clover’s board");
});

it("follows turns until browsing, remains paused across turns, and resumes at the current player", () => {
  let table = sample();
  const result = render(view(table));
  expect(screen.getByRole("region", { name: "Clover’s board" })).toBeInTheDocument();
  table = { ...table, game: { ...table.game, turn: 2 } };
  result.rerender(view(table));
  expect(screen.getByRole("region", { name: "Birdie’s board" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next board: Sunny" }));
  expect(screen.getByRole("button", { name: /Auto-follow/ })).toHaveAttribute("aria-pressed", "false");
  table = { ...table, game: { ...table.game, turn: 0 }, canDraw: true };
  result.rerender(view(table));
  expect(screen.getByRole("region", { name: "Sunny’s board" })).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Turn" })).toHaveTextContent("Your turn");
  expect(screen.getByRole("button", { name: /Draw from deck/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Back to my board" }));
  expect(screen.getByRole("button", { name: /Draw from deck/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Auto-follow/ })).toHaveAttribute("aria-pressed", "false");
  table = { ...table, game: { ...table.game, turn: 1 }, canDraw: false };
  result.rerender(view(table));
  expect(screen.getByRole("region", { name: "Your board" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Auto-follow/ }));
  expect(screen.getByRole("region", { name: "Clover’s board" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Auto-follow/ })).toHaveAttribute("aria-pressed", "true");
});

it("wraps navigation in both directions and marks the next turn separately from the viewed player", () => {
  render(view(sample(6, 0)));
  fireEvent.click(screen.getByRole("button", { name: "Previous board: Robin" }));
  expect(screen.getByRole("region", { name: "Robin’s board" })).toBeInTheDocument();
  expect(screen.getByText("Up next:")).toHaveTextContent("Clover");
  const carousel = screen.getByRole("region", { name: /Player boards/ });
  fireEvent.keyDown(carousel, { key: "ArrowRight" });
  expect(screen.getByRole("region", { name: "Your board" })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Choose a player board" })).getByRole("button", { name: /Clover.*up next/ })).toHaveAttribute("data-next", "true");
});

it("keeps draw and discard flights mounted while viewing another player's board", () => {
  let table = sample();
  const result = render(view(table));
  fireEvent.click(screen.getByRole("button", { name: "Next board: Birdie" }));
  const card = table.game.deck[table.game.deck.length - 1];
  table = { ...table, motion: { kind: "draw", card, from: "deck", to: "drawn-1", flip: true, seat: 1, index: -1, source: "deck" } };
  result.rerender(view(table));
  expect(result.container.querySelector(".golf-card-flight")).toHaveAttribute("data-offscreen-flight", "true");
  expect(screen.getByRole("status", { name: "Turn" })).toHaveTextContent("Clover is drawing");
  table = { ...table, motion: { ...table.motion!, kind: "discard", from: "card-1-0", to: "discard", index: 0 } };
  result.rerender(view(table));
  expect(result.container.querySelector(".golf-card-flight")).toHaveAttribute("data-offscreen-flight", "true");
  expect(screen.getByRole("region", { name: "Birdie’s board" })).toBeInTheDocument();
});

it("pops each player's hole score in their own dock", async () => {
  vi.useFakeTimers();
  const table = sample(3);
  table.game = { ...table.game, phase: "round-over", history: [[3, 0, -1]] };
  const result = render(view(table));
  await act(async () => {});
  try {
    act(() => { vi.advanceTimersByTime(FLIP_MS + 250); });
    expect(result.container.querySelectorAll(".golf-drawn-dock .golf-hole-score")).toHaveLength(3);
    expect(result.container.querySelector(".golf-seat-marker .golf-hole-score")).not.toBeInTheDocument();
    expect(result.container.querySelector(".golf-shared-draw")).not.toBeInTheDocument();
    expect([...result.container.querySelectorAll(".golf-hole-score")].map(score => score.textContent)).toEqual(["+3", "+0", "−1"]);
  } finally {
    result.unmount();
    vi.useRealTimers();
  }
});

it("keeps the scorecard focused on player scores and leaving the table", () => {
  const result = render(view(sample()));
  const panel = result.container.querySelector(".golf-match-panel")!;
  expect(panel).toHaveTextContent("Scorecard");
  expect(panel.querySelectorAll("ol li")).toHaveLength(4);
  expect(panel).not.toHaveTextContent("Nine holes");
  expect(panel.querySelectorAll("a")).toHaveLength(0);
  expect(panel.querySelector("ol + hr + button")).toHaveTextContent("Concede");
});
