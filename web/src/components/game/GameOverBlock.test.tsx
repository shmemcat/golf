import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { GameOverBlock, type FinalPlayer } from "./GameOverBlock";
import userEvent from "@testing-library/user-event";

beforeEach(() => {
  // JSDOM does not implement the browser's native modal methods.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
});

const players: FinalPlayer[] = [
  { name: "Emily", score: 47 },
  { name: "Clover", score: 15, isBot: true },
  { name: "Birdie", score: 22, isBot: true },
];

function open(custom = players, onPlayAgain = vi.fn()) {
  return render(<MemoryRouter initialEntries={["/results"]}><Routes>
    <Route path="/results" element={<GameOverBlock players={custom} onPlayAgain={onPlayAgain} />} />
    <Route path="/game/create" element={<h1>Game setup</h1>} />
    <Route path="/" element={<h1>Golf home</h1>} />
  </Routes></MemoryRouter>);
}

it("announces the winner, sorts lowest scores first and highlights the human row", () => {
  open();
  expect(screen.getByRole("dialog", { name: "Clover won!" })).toBeVisible();
  const rows = within(screen.getByRole("table", { name: "Final scores" })).getAllByRole("row").slice(1);
  expect(rows.map(row => row.textContent)).toEqual(["Clover15", "Birdie22", "Emily47"]);
  expect(rows[2]).toHaveAttribute("data-current", "true");
  expect(rows[0]).toHaveAttribute("data-winner", "true");
});

it("recognizes a signed-in human winner and restarts with Play Again", () => {
  const restart = vi.fn();
  open([{ ...players[0], score: 5 }, ...players.slice(1)], restart);
  expect(screen.getByRole("heading", { name: "You won!" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Play Again", exact: true }));
  expect(restart).toHaveBeenCalledOnce();
});

it("recognizes every tied lowest score as a shared win", () => {
  open([{ ...players[0], score: 15 }, ...players.slice(1)]);
  expect(screen.getByRole("heading", { name: "It's a tie!" })).toBeVisible();
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  expect(rows.filter(row => row.getAttribute("data-winner") === "true").map(row => row.textContent))
    .toEqual(["Emily15", "Clover15"]);
});

it.each([["Create New Game", "Game setup"], ["Home", "Golf home"]])("%s opens its destination", (button, heading) => {
  open();
  fireEvent.click(screen.getByRole("button", { name: button, exact: true }));
  expect(screen.getByRole("heading", { name: heading })).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps non-hosts waiting and explains host replays inside the modal on focus and tap", async () => {
  const user = userEvent.setup();
  const restart = vi.fn();
  render(<MemoryRouter><GameOverBlock players={players} onPlayAgain={restart} waitingForHost /></MemoryRouter>);
  const waiting = screen.getByRole("button", { name: "Waiting for host…" });
  expect(waiting).toBeDisabled();
  expect(waiting.parentElement).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Only the host can start a new game.");
  expect(screen.getByRole("dialog")).toContainElement(screen.getByRole("tooltip"));
  expect(screen.queryByRole("button", { name: "Play Again", exact: true })).not.toBeInTheDocument();
  fireEvent.click(waiting);
  expect(restart).not.toHaveBeenCalled();
  await user.tab();
  expect(screen.getByRole("button", { name: "Create New Game" })).toHaveFocus();
  fireEvent.click(waiting.parentElement!);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Only the host can start a new game.");
  expect(restart).not.toHaveBeenCalled();
});
