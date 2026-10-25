import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Providers } from "@/App";
import { App } from "@/App";
import GamePage, { GolfTableView } from "./GamePage";
import { DEAL_MS, FLIP_MS, FLIGHT_MS } from "@/hooks/useGolfTable";
import type { useGolfTable } from "@/hooks/useGolfTable";
import { createGame, discardDraw, drawCard, nextHole, openCard, openOpponents, startPlay, turnUpDeck, type Game, type Rank } from "@/game/engine";
import { readResults } from "@/lib/results";
import { readLocalGame } from "@/lib/localGame";
import { BOT_NAMES } from "@/game/seats";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(JSON.stringify(path === "/api/golf/active" ? { rooms: [] } : { user: null, csrf_token: "test" }))));
});

function endingTable(game: Game): ReturnType<typeof useGolfTable> {
  const noop = () => {};
  return { game, stage: "playing", motion: null, pickerSeat: 0,
    canReveal: () => false, canDraw: false, canReplace: false,
    reveal: noop, draw: noop, replace: noop, toss: noop, advance: noop, restart: noop };
}

it.each([0, 2, 5])("announces seat %i going out once for two seconds and keeps its flag through the final turns", async seat => {
  vi.useFakeTimers();
  const ready = { ...createGame(6), phase: "draw" as const, turn: seat };
  ready.players[seat].cards = ready.players[seat].cards.map(cell => ({ ...cell, faceUp: true }));
  const out = discardDraw(drawCard(ready, "deck"));
  const nextTurn = discardDraw(drawCard(out, "deck"));
  const playerName = seat === 0 ? "You" : BOT_NAMES[seat - 1];
  const tableView = (game: Game) => <MemoryRouter><Providers><GolfTableView count={6} selection="backing" table={endingTable(game)} /></Providers></MemoryRouter>;
  const view = render(tableView(ready));
  await act(async () => {});
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  const chimes = () => vi.mocked(HTMLMediaElement.prototype.play).mock.contexts.filter(audio =>
    audio instanceof HTMLMediaElement && audio.src.endsWith("/sounds/going-out.mp3"));
  const notice = () => view.container.querySelector(".golf-going-out-notice");
  const flag = () => view.container.querySelector(`.golf-seat[data-seat="${seat}"] .golf-going-out-flag`);
  try {
    expect(notice()).not.toBeInTheDocument();
    view.rerender(tableView(out));
    expect(notice()).toHaveTextContent(`${playerName} went out`);
    expect(notice()).toHaveTextContent("Everyone else gets one last turn.");
    expect(flag()).toHaveAccessibleName(`${playerName} went out`);
    expect(view.container.querySelectorAll(".golf-going-out-flag")).toHaveLength(1);
    expect(chimes()).toHaveLength(1);
    tick(500);
    // Advancing the queue and receiving fresh snapshots must not restart either cue.
    view.rerender(tableView(nextTurn));
    tick(1000);
    expect(notice()).toBeInTheDocument();
    view.rerender(tableView({ ...nextTurn, finalTurns: [...nextTurn.finalTurns!] }));
    tick(499);
    expect(notice()).toBeInTheDocument();
    tick(1);
    expect(notice()).not.toBeInTheDocument();
    expect(flag()).toBeInTheDocument();
    expect(chimes()).toHaveLength(1);

    view.rerender(tableView({ ...ready, hole: 2 }));
    expect(flag()).not.toBeInTheDocument();
    view.rerender(tableView({ ...out, hole: 2 }));
    expect(notice()).toHaveTextContent(`${playerName} went out`);
    expect(chimes()).toHaveLength(2);
    view.unmount();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("restores a final-turn flag without replaying the going-out announcement or sound", async () => {
  const ready = { ...createGame(3), phase: "draw" as const, turn: 2 };
  ready.players[2].cards = ready.players[2].cards.map(cell => ({ ...cell, faceUp: true }));
  const out = discardDraw(drawCard(ready, "deck"));
  const view = render(<MemoryRouter><Providers><GolfTableView count={3} selection="backing" table={endingTable(out)} /></Providers></MemoryRouter>);
  await act(async () => {});
  expect(view.container.querySelector('.golf-seat[data-seat="2"] .golf-going-out-flag')).toHaveAccessibleName("Birdie went out");
  expect(view.container.querySelector(".golf-going-out-notice")).not.toBeInTheDocument();
  expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts.some(audio =>
    audio instanceof HTMLMediaElement && audio.src.endsWith("/sounds/going-out.mp3"))).toBe(false);
});

it.each([1, 9])("reveals all remaining cards on hole %i and holds the board for three seconds after the flip before showing results", async hole => {
  vi.useFakeTimers();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  const started = startPlay(turnUpDeck(openOpponents(openCard(openCard(createGame(4), 0), 4))));
  const lastTurn = drawCard({ ...started, hole, turn: 1, finalTurns: [1] }, "deck");
  const finished = discardDraw(lastTurn);
  const tableView = (game: Game) => <MemoryRouter><Providers><GolfTableView count={4} selection="backing" table={endingTable(game)} /></Providers></MemoryRouter>;
  const view = render(tableView(lastTurn));
  await act(async () => {});
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  const pops = () => vi.mocked(HTMLMediaElement.prototype.play).mock.contexts.filter(audio =>
    audio instanceof HTMLMediaElement && audio.src.endsWith("/sounds/pop.mp3"));
  try {
    expect(view.container.querySelectorAll('.golf-card-slot [data-face-up="false"]')).toHaveLength(16);
    view.rerender(tableView(finished));
    expect(view.container.querySelectorAll('.golf-card-slot [data-face-up="true"]')).toHaveLength(24);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Draw from deck/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /face down/ })).not.toBeInTheDocument();
    tick(FLIP_MS);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.container.querySelector(".golf-hole-score")).not.toBeInTheDocument();
    expect(pops()).toHaveLength(0);
    tick(249);
    expect(view.container.querySelector(".golf-hole-score")).not.toBeInTheDocument();
    tick(1);
    const scores = view.container.querySelectorAll(".golf-hole-score");
    expect(scores).toHaveLength(4);
    finished.history.at(-1)!.forEach((score, seat) => {
      expect(scores[seat]).toHaveTextContent(score >= 0 ? `+${score}` : `−${Math.abs(score)}`);
      expect(scores[seat]).toHaveAttribute("data-went-out", String(seat === 2));
      expect(scores[seat].closest(".golf-seat-marker")).toBeInTheDocument();
    });
    expect(view.container.querySelector(".golf-drawn-dock .golf-hole-score")).not.toBeInTheDocument();
    expect(pops()).toHaveLength(1);
    tick(750);
    // A fresh server snapshot of the same hole must not restart the review.
    view.rerender(tableView({ ...finished }));
    tick(1999);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pops()).toHaveLength(1);
    tick(1);
    expect(screen.getByRole("dialog")).toBeVisible();
    if (hole === 9) expect(screen.getByRole("table", { name: "Final scores" })).toBeVisible();
    else expect(screen.getByRole("dialog", { name: "Hole 1 complete" })).toBeVisible();
    expect(screen.getByRole("button", { name: hole === 9 ? "Play Again" : "Next Hole", exact: true })).toHaveFocus();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("cancels a pending results popup when the hole changes or the table is left", async () => {
  vi.useFakeTimers();
  const first = discardDraw(drawCard({ ...createGame(2), phase: "draw", finalTurns: [0] }, "deck"));
  const tableView = (game: Game) => <MemoryRouter><Providers><GolfTableView count={2} selection="backing" table={endingTable(game)} /></Providers></MemoryRouter>;
  const view = render(tableView(first));
  await act(async () => {});
  try {
    act(() => { vi.advanceTimersByTime(FLIP_MS + 1000); });
    view.rerender(tableView(nextHole(first)));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.container.querySelector(".golf-hole-score")).not.toBeInTheDocument();
    view.rerender(tableView(first));
    act(() => { vi.advanceTimersByTime(FLIP_MS + 2999); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("toggles the hole results to inspect the board and opens the next hole’s results normally", async () => {
  vi.useFakeTimers();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  const finished = discardDraw(drawCard({ ...createGame(4), phase: "draw", turn: 0, finalTurns: [0] }, "deck"));
  const advance = vi.fn();
  const tableView = (game: Game, pending = false) => <MemoryRouter><Providers><GolfTableView count={4} selection="backing"
    table={{ ...endingTable(game), advance }} pending={pending} /></Providers></MemoryRouter>;
  const view = render(tableView(finished));
  await act(async () => {});
  try {
    expect(screen.queryByRole("button", { name: "Hide hole results" })).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(FLIP_MS + 3000); });
    const hide = screen.getByRole("button", { name: "Hide hole results" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(hide.querySelector("svg")).toHaveAttribute("data-icon", "eye-slash");
    fireEvent.click(hide);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your board" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Draw from deck/ })).toBeDisabled();
    expect(view.container.querySelectorAll('.golf-card-slot [data-face-up="true"]')).toHaveLength(24);
    const show = screen.getByRole("button", { name: "Show hole results" });
    expect(show).toHaveFocus();
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(show.querySelector("svg")).toHaveAttribute("data-icon", "eye");
    expect(advance).not.toHaveBeenCalled();

    view.rerender(tableView({ ...finished }, true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show hole results" }));
    expect(screen.getByRole("dialog", { name: "Hole 1 complete" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next Hole", exact: true })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Waiting for players…" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide hole results" }));

    view.rerender(tableView({ ...finished }));
    fireEvent.click(screen.getByRole("button", { name: "Show hole results" }));
    fireEvent.click(screen.getByRole("button", { name: "Next Hole", exact: true }));
    expect(advance).toHaveBeenCalledOnce();

    const next = nextHole(finished);
    view.rerender(tableView(next));
    expect(screen.queryByRole("button", { name: /hole results/ })).not.toBeInTheDocument();
    view.rerender(tableView(discardDraw(drawCard({ ...next, phase: "draw", turn: 0, finalTurns: [0] }, "deck"))));
    act(() => { vi.advanceTimersByTime(FLIP_MS + 3000); });
    expect(screen.getByRole("dialog", { name: "Hole 2 complete" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next Hole", exact: true })).toHaveFocus();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("toggles the final results without restarting the game or losing rematch updates", async () => {
  vi.useFakeTimers();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  const finished = discardDraw(drawCard({ ...createGame(4), hole: 9, phase: "draw", turn: 0, finalTurns: [0] }, "deck"));
  const restart = vi.fn();
  const tableView = (game: Game, waiting = false) => <MemoryRouter><Providers><GolfTableView count={4} selection="backing"
    table={{ ...endingTable(game), restart }} rematchWaiting={waiting} resultNotice={<p>Your results have been saved.</p>} /></Providers></MemoryRouter>;
  const view = render(tableView(finished));
  await act(async () => {});
  try {
    act(() => { vi.advanceTimersByTime(FLIP_MS + 3000); });
    const scores = screen.getByRole("table", { name: "Final scores" }).textContent;
    const hide = screen.getByRole("button", { name: "Hide game results" });
    expect(hide.querySelector("svg")).toHaveAttribute("data-icon", "eye-slash");
    fireEvent.click(hide);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your board" })).toBeVisible();
    expect(view.container.querySelectorAll('.golf-card-slot [data-face-up="true"]')).toHaveLength(24);
    const show = screen.getByRole("button", { name: "Show game results" });
    expect(show).toHaveFocus();
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(show.querySelector("svg")).toHaveAttribute("data-icon", "eye");
    expect(restart).not.toHaveBeenCalled();

    view.rerender(tableView({ ...finished }, true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show game results" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("table", { name: "Final scores" }).textContent).toBe(scores);
    expect(screen.getByText("Your results have been saved.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Starting game…" })).toBeDisabled();
    view.rerender(tableView(finished));
    fireEvent.click(screen.getByRole("button", { name: "Hide game results" }));
    fireEvent.click(screen.getByRole("button", { name: "Show game results" }));
    expect(screen.getByRole("button", { name: "Play Again", exact: true })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Play Again", exact: true }));
    expect(restart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Hide game results" }));
    view.rerender(tableView(createGame(4)));
    expect(screen.queryByRole("button", { name: /game results/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("pops the signed hole scores, including a going-out penalty, instead of accumulated totals", async () => {
  vi.useFakeTimers();
  const ranks: Rank[][] = [["A", "K", "K", "K", "A", "K"], ["2", "2", "K", "K", "A", "K"],
    ["A", "3", "5", "A", "3", "5"], ["5", "5", "K", "8", "7", "A"]];
  const dealt = createGame(4);
  dealt.players = dealt.players.map((player, seat) => ({ score: 100, cards: player.cards.map((cell, index) => ({
    faceUp: true, card: { ...cell.card, rank: ranks[seat][index] },
  })) }));
  const game = discardDraw(drawCard({ ...dealt, phase: "draw", turn: 3, finalTurns: [3] }, "deck"));
  const view = render(<MemoryRouter><Providers><GolfTableView count={4} selection="backing" table={endingTable(game)} /></Providers></MemoryRouter>);
  await act(async () => {});
  try {
    act(() => { vi.advanceTimersByTime(FLIP_MS + 250); });
    const pops = view.container.querySelectorAll(".golf-hole-score");
    expect([...pops].map(pop => pop.textContent)).toEqual(["+12", "−3", "+0", "+26"]);
    expect(pops[0]).toHaveAttribute("data-went-out", "true");
    expect(pops[0]).toHaveAccessibleName("You scored 12 this hole, went out first");
    expect([...pops].slice(1).every(pop => pop.getAttribute("data-went-out") === "false")).toBe(true);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it.each([2, 3, 4, 5, 6])("renders the %i-player desktop table with the local player in the bottom center and hidden ranks inaccessible", async count => {
  const view = render(<MemoryRouter initialEntries={[`/game/single?players=${count}`]}><Providers><GamePage /></Providers></MemoryRouter>);
  expect(await screen.findByRole("main", { name: `${count}-player Golf table` })).toBeInTheDocument();
  expect(view.container.querySelectorAll(".golf-seat")).toHaveLength(count);
  const human = screen.getByRole("region", { name: "Your board" });
  expect(human).toHaveAttribute("data-position", "bottom");
  expect(within(human).getAllByRole("button")).toHaveLength(6);
  expect(within(human).getAllByRole("button").every(button => button.getAttribute("aria-label")?.endsWith("face down"))).toBe(true);
  expect(within(human).queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Draw from deck/ })).toBeDisabled();
});

it("starts the selected table from Create Game", async () => {
  render(<MemoryRouter initialEntries={["/game/create"]}><Providers><App /></Providers></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "5 Players" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Create Game", exact: true })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create Game", exact: true }));
  expect(await screen.findByRole("main", { name: "5-player Golf table" })).toBeInTheDocument();
});

it("defaults invalid player counts to two seats", async () => {
  render(<MemoryRouter initialEntries={["/game/single?players=99"]}><Providers><GamePage /></Providers></MemoryRouter>);
  expect(await screen.findByRole("main", { name: "2-player Golf table" })).toBeInTheDocument();
});

it("returns through the progress prompt and restores a guest table after navigation and reload", async () => {
  let view = render(<MemoryRouter initialEntries={["/game/single?players=5"]}><Providers><App /></Providers></MemoryRouter>);
  await screen.findByRole("main", { name: "5-player Golf table" });
  const saved = readLocalGame()!;
  fireEvent.click(screen.getByRole("button", { name: "Leave table", exact: true }));
  expect(await screen.findByRole("dialog", { name: "Game In Progress" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue", exact: true }));
  await screen.findByRole("main", { name: "5-player Golf table" });
  expect(readLocalGame()?.game.id).toBe(saved.game.id);
  view.unmount();
  view = render(<MemoryRouter initialEntries={["/game/single?players=2"]}><Providers><App /></Providers></MemoryRouter>);
  await screen.findByRole("main", { name: "5-player Golf table" });
  expect(readLocalGame()?.game.id).toBe(saved.game.id);
  expect(readLocalGame()?.game.players).toEqual(saved.game.players);
  view.unmount();
});

it.each([0, 5])("only enables the opposite row and different columns after opening position %i", async first => {
  vi.useFakeTimers();
  const view = render(<MemoryRouter initialEntries={["/game/single?players=2"]}><Providers><GamePage /></Providers></MemoryRouter>);
  await act(async () => {});
  const label = (index: number) => `Reveal ${index < 3 ? "top" : "bottom"} row, column ${index % 3 + 1}, face down`;
  try {
    act(() => { vi.advanceTimersByTime(DEAL_MS); });
    expect(screen.getByText("Flip one top card and one bottom card, in different columns.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: label(first) }));
    act(() => { vi.advanceTimersByTime(FLIP_MS); });
    expect(screen.getByText(`Flip a card in the ${first < 3 ? "bottom" : "top"} row and a different column.`)).toBeVisible();
    for (let index = 0; index < 6; index++) {
      if (index === first) continue;
      const button = screen.getByRole("button", { name: label(index) });
      if (Math.floor(index / 3) !== Math.floor(first / 3) && index % 3 !== first % 3) expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
    }
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("lets the drawn card itself discard a deck draw and keeps a discard draw reserved for replacement", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  const view = render(<MemoryRouter initialEntries={["/game/single?players=2"]}><Providers><GamePage /></Providers></MemoryRouter>);
  await act(async () => {});
  try {
    advance(DEAL_MS);
    fireEvent.click(screen.getByRole("button", { name: "Reveal top row, column 1, face down" }));
    advance(FLIP_MS);
    fireEvent.click(screen.getByRole("button", { name: "Reveal bottom row, column 2, face down" }));
    for (let i = 0; i < 30 && !screen.getByRole("button", { name: /Draw from deck/ }).matches(":enabled"); i++) advance(300);
    fireEvent.click(screen.getByRole("button", { name: /Draw from deck/ }));
    advance(FLIGHT_MS);
    const drawn = screen.getByRole("button", { name: /^Discard drawn / });
    expect(drawn).toBeEnabled();
    fireEvent.click(drawn);
    advance(FLIGHT_MS);
    expect(screen.queryByRole("button", { name: /^Discard drawn / })).not.toBeInTheDocument();
    expect(view.container.querySelectorAll('.golf-seat-human .golf-tableau > .golf-card-slot [data-face-up="true"]')).toHaveLength(2);
    for (let i = 0; i < 50 && !screen.getByRole("button", { name: /Draw from deck/ }).matches(":enabled"); i++) advance(300);
    fireEvent.click(screen.getByRole("button", { name: /from discard$/ }));
    advance(FLIGHT_MS);
    expect(screen.getByRole("button", { name: /Drawn .*choose a board card to replace/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Discard drawn / })).not.toBeInTheDocument();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("plays a guest nine-hole game without crediting an account and starts a fresh game with Play Again", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<MemoryRouter initialEntries={["/game/single?players=2"]}><Providers><GamePage /></Providers></MemoryRouter>);
  });
  let finishedHoles = 0;
  try {
    for (let step = 0; step < 3000; step++) {
      if (view.container.querySelector(".golf-game-over[open]")) break;
      const next = view.container.querySelector<HTMLButtonElement>(".golf-round-summary[open] button");
      if (next) {
        finishedHoles++;
        expect(screen.getByRole("dialog", { name: `Hole ${finishedHoles} complete` })).toBeVisible();
        fireEvent.click(next);
        continue;
      }
      const reveal = view.container.querySelector<HTMLButtonElement>('button[aria-label^="Reveal "]:enabled');
      const draw = view.container.querySelector<HTMLButtonElement>('[data-anchor="deck"]')!;
      const replace = view.container.querySelector<HTMLButtonElement>('button[aria-label^="Replace "][aria-label$="face down"]:enabled');
      const toss = view.container.querySelector<HTMLButtonElement>('button[aria-label^="Discard drawn "]:enabled');
      if (reveal) fireEvent.click(reveal);
      else if (!draw.disabled) fireEvent.click(draw);
      else if (replace) fireEvent.click(replace);
      else if (toss) fireEvent.click(toss);
      else act(() => { vi.advanceTimersByTime(300); });
    }
    expect(finishedHoles).toBe(8);
    expect(within(screen.getByRole("table", { name: "Final scores" })).getAllByRole("row")).toHaveLength(3);
    expect(view.container.querySelector(".golf-info-pill")).toHaveTextContent("Hole 9 / 9");
    expect(readResults("golfer")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Play Again", exact: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(view.container.querySelector(".golf-info-pill")).toHaveTextContent("Hole 1 / 9");
    expect(view.container.querySelectorAll(".golf-seat")).toHaveLength(2);
    expect([...view.container.querySelectorAll(".golf-seat-score")].every(score => score.textContent === "0 points")).toBe(true);
    expect(readResults("golfer")).toHaveLength(0);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
}, 15000);
