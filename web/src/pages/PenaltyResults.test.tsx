import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Providers } from "@/App";
import { PenaltyBanner } from "@/components/game/PenaltyBanner";
import { createGame, discardDraw, drawCard, nextHole, replaceCard, type Game, type Rank } from "@/game/engine";
import type { useGolfTable } from "@/hooks/useGolfTable";
import { projectTable } from "@/hooks/useServerGolfTable";
import { roomFixture } from "@/test/golfFixtures";
import { GolfTableView } from "./GamePage";

const names = ["Emily", "Birdie", "Clover"];
const name = (seat: number) => names[seat];

function finishedHole(hole = 1, tied = false): Game {
  const ranks: Rank[][] = [
    tied ? ["K", "A", "K", "K", "A", "3"] : ["K", "A", "3", "K", "A", "4"],
    ["K", "A", "K", "K", "A", "3"],
    ["K", "A", "5", "K", "A", "6"],
  ];
  let game: Game = { ...createGame(3), hole, turn: 0, phase: "draw",
    history: Array.from({ length: hole - 1 }, () => [3, 4, 5]),
    discard: [{ id: "out-draw", rank: ranks[0][5], suit: "H" }],
  };
  game.players = game.players.map((player, seat) => ({ ...player, score: (seat + 3) * (hole - 1),
    cards: ranks[seat].map((rank, index) => ({ faceUp: index !== 5, card: { id: `${seat}-${index}`, rank, suit: "S" } })),
  }));
  game = replaceCard(drawCard(game, "discard"), 5);
  game = discardDraw(drawCard(game, "deck"));
  return discardDraw(drawCard(game, "deck"));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: null, csrf_token: "test" }))));
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
});

it.each([1, 9])("explains the actual penalty above the scores on hole %i without a dot after the name", async hole => {
  vi.useFakeTimers();
  const game = finishedHole(hole);
  const noop = () => {};
  const table: ReturnType<typeof useGolfTable> = { game, stage: "playing", motion: null, pickerSeat: 0,
    canReveal: () => false, canDraw: false, canReplace: false,
    reveal: noop, draw: noop, replace: noop, toss: noop, advance: noop, restart: noop,
  };
  const participants = names.map(name => ({ name, isBot: false, profileIcon: "user", connected: true }));
  let view!: ReturnType<typeof render>;
  try {
    await act(async () => {
      view = render(<MemoryRouter><Providers><GolfTableView count={3} selection="backing" table={table} participants={participants} /></Providers></MemoryRouter>);
    });
    act(() => { vi.advanceTimersByTime(10000); });
    const dialog = screen.getByRole("dialog");
    const banner = within(dialog).getByRole("complementary", { name: "Going-out penalty" });
    expect(banner).toBeVisible();
    expect(banner.querySelector(".golf-penalty-heading")).toHaveTextContent(/^Emily \+10 penalty$/);
    expect(banner).toHaveTextContent("Emily went out with 7, but Birdie finished with 3.");
    if (hole === 9) expect(banner).toHaveTextContent("Hole 9:");
    const scores = dialog.querySelector(hole === 9 ? ".golf-final-score-table" : ".golf-round-scores")!;
    expect(banner.compareDocumentPosition(scores) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(game.history.at(-1)).toEqual([17, 3, 11]);
    if (hole === 1) {
      expect([...scores.children].slice(1).map(row => row.textContent)).toEqual(["Birdie+33", "Clover+1111", "Emily+1717"]);
      const currentRows = scores.querySelectorAll('[data-current="true"]');
      expect(currentRows).toHaveLength(1);
      expect(currentRows[0]).toHaveTextContent("Emily+1717");
      view.rerender(<MemoryRouter><Providers><GolfTableView count={3} selection="backing" table={{ ...table, game: nextHole(game) }} participants={participants} /></Providers></MemoryRouter>);
      expect(screen.queryByRole("complementary", { name: "Going-out penalty" })).not.toBeInTheDocument();
    }
  } finally {
    view?.unmount();
    vi.useRealTimers();
  }
});

it.each([0, 1, 2].flatMap(mySeat => [false, true].map(tied => ({ mySeat, tied }))))("keeps the penalty assigned to the right person when online seat $mySeat views the table (tied: $tied)", ({ mySeat, tied }) => {
  const game = finishedHole(1, tied);
  const { deck, ...source } = game;
  const state = roomFixture(3, mySeat);
  state.game = { ...source, deckCount: deck.length };
  const projected = projectTable(state);
  render(<PenaltyBanner game={projected.game} name={seat => projected.participants[seat].name} />);
  const banner = screen.getByRole("complementary", { name: "Going-out penalty" });
  expect(banner).toHaveTextContent("Friend 0 +10 penalty");
  expect(banner).toHaveTextContent(tied
    ? "Friend 0 went out with 3, but Friend 1 also finished with 3."
    : "Friend 0 went out with 7, but Friend 1 finished with 3.");
});

it.each([1, 9])("explains a tied lowest score on hole %i and penalizes only the player who went out", hole => {
  const game = finishedHole(hole, true);
  render(<PenaltyBanner game={game} name={name} />);
  const banner = screen.getByRole("complementary", { name: "Going-out penalty" });
  expect(banner).toHaveTextContent("Emily +10 penalty");
  expect(banner).toHaveTextContent("Emily went out with 3, but Birdie also finished with 3.");
  if (hole === 9) expect(banner).toHaveTextContent("Hole 9:");
  expect(game.history.at(-1)).toEqual([13, 3, 11]);
  expect(game.players.map(player => player.score)).toEqual([3 * (hole - 1) + 13, 4 * (hole - 1) + 3, 5 * (hole - 1) + 11]);
});

it("omits the banner for a strictly lowest score, active play, or a hole whose stored score has no penalty", () => {
  const game = finishedHole();
  const winner = finishedHole(1, true);
  winner.players[0].cards[5].card.rank = "K";
  winner.history = [[0, 3, 11]];
  const view = render(<PenaltyBanner game={winner} name={name} />);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  view.rerender(<PenaltyBanner game={nextHole(game)} name={name} />);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  view.rerender(<PenaltyBanner game={{ ...game, history: [[7, 3, 11]] }} name={name} />);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  view.rerender(<PenaltyBanner game={{ ...finishedHole(1, true), history: [[3, 3, 11]] }} name={name} />);
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
});
