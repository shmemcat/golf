import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/App";
import { CardBackDisplayOption } from "@/components/CardBackDisplayOption";
import { useServerGolfTable } from "@/hooks/useServerGolfTable";
import type { AccountUser } from "@/lib/account";
import type { RoomState } from "@/lib/golfApi";
import { roomFixture } from "@/test/golfFixtures";
import { GolfTableView } from "./GamePage";

function Table({ state, local = false }: { state: RoomState; local?: boolean }) {
  const { table, participants } = useServerGolfTable(state, async () => true, false);
  return <GolfTableView count={3} selection="border" table={table} participants={local ? undefined : participants} multiplayer={!local && state.mode === "multiplayer"} />;
}

function tableState() {
  const state = roomFixture(3, 1);
  state.seats[0].cardBack = "compass";
  state.seats[1].cardBack = "ginkgo";
  state.seats[2].cardBack = "fern-sprig";
  state.motion = { kind: "discard", seat: 2, from: "card-2-0", to: "discard", index: 0, source: "deck", flip: true, card: { id: "outgoing", rank: "2", suit: "S" } };
  return state;
}
const boardBacks = () => [0, 1, 2].map(seat => Array.from(document.querySelectorAll(`[data-seat="${seat}"] .golf-grid-card .card-back`), card => card.getAttribute("data-card-back")));

it.each(["uniform", "players"] as const)("applies the profile display mode to rotated player boards, the deck, and card flights (%s)", async mode => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { id: "viewer", name: "Viewer", card_backs: { golf: "ginkgo" }, card_back_display: { golf: mode } }, csrf_token: "test" }))));
  const state = tableState();
  const view = (value: RoomState) => <MemoryRouter><Providers><Table state={value} /></Providers></MemoryRouter>;
  const page = render(view({ ...state, motion: null }));
  const expected = mode === "uniform" ? ["ginkgo", "ginkgo", "ginkgo"] : ["ginkgo", "fern-sprig", "compass"];
  await waitFor(() => expect(boardBacks()).toEqual(expected.map(back => Array(6).fill(back))));
  expect(document.querySelector('[data-anchor="deck"] .card-back')).toHaveAttribute("data-card-back", "ginkgo");
  page.rerender(view(state));
  await waitFor(() => expect(document.querySelector(".golf-card-flight .card-back")).toHaveAttribute("data-card-back", mode === "players" ? "fern-sprig" : "ginkgo"));
});

it.each([
  { source: "server", local: false, mode: "uniform" },
  { source: "server", local: false, mode: "players" },
  { source: "local", local: true, mode: "uniform" },
  { source: "local", local: true, mode: "players" },
] as const)("uses the selected design for all $source bot-game cards in $mode display mode", async ({ local, mode }) => {
  let account: AccountUser = { id: "viewer", name: "Viewer", card_backs: { golf: "ginkgo" }, card_back_display: { golf: mode } };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: account, csrf_token: "test" }))));
  const state = tableState();
  state.mode = "bot";
  state.seats.forEach((seat, index) => { seat.isBot = index !== state.mySeat; });
  state.game!.drawn = { card: { id: "drawn", rank: "3", suit: "H" }, source: "deck" };
  const view = (value: RoomState) => <MemoryRouter><Providers><Table state={value} local={local} /></Providers></MemoryRouter>;
  const page = render(view({ ...state, motion: null }));
  await waitFor(() => expect(boardBacks()).toEqual(Array.from({ length: 3 }, () => Array(6).fill("ginkgo"))));
  expect(document.querySelector('[data-anchor="deck"] .card-back')).toHaveAttribute("data-card-back", "ginkgo");
  expect(document.querySelector('.golf-drawn-card .card-back')).toHaveAttribute("data-card-back", "ginkgo");
  page.rerender(view(state));
  await waitFor(() => expect(document.querySelector(".golf-card-flight .card-back")).toHaveAttribute("data-card-back", "ginkgo"));
  account = { ...account, card_backs: { golf: "north-star" } };
  fireEvent(window, new Event("focus"));
  await waitFor(() => {
    const backs = document.querySelectorAll(".golf-game-shell .card-back");
    expect(backs.length).toBeGreaterThan(18);
    backs.forEach(back => expect(back).toHaveAttribute("data-card-back", "north-star"));
  });
});

it("refreshes the saved display mode in-game and uses Argyle for missing or unsupported player designs", async () => {
  let account: AccountUser = { id: "viewer", name: "Viewer", card_backs: { golf: "ginkgo" }, card_back_display: { golf: "uniform" } };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: account, csrf_token: "test" }))));
  const state = tableState();
  state.seats[0].cardBack = "unsupported";
  delete state.seats[2].cardBack;
  render(<MemoryRouter><Providers><Table state={state} /></Providers></MemoryRouter>);
  await waitFor(() => expect(boardBacks()).toEqual(Array.from({ length: 3 }, () => Array(6).fill("ginkgo"))));
  account = { ...account, card_back_display: { golf: "players" } };
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(boardBacks()).toEqual([Array(6).fill("ginkgo"), Array(6).fill("argyle"), Array(6).fill("argyle")]));
});

it("rolls back a failed display save without changing the selected card back and allows retry", async () => {
  let fail = true;
  let account: AccountUser = { id: "viewer", name: "Viewer", card_backs: { golf: "ginkgo" }, card_back_display: { golf: "uniform" } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/profile")) {
      if (fail) return new Response(JSON.stringify({ error: "Unable to save display. Try again." }), { status: 503 });
      account = { ...account, card_back_display: { golf: JSON.parse(String(init?.body)).card_back.display } };
    }
    return new Response(JSON.stringify({ user: account, csrf_token: "test" }));
  }));
  render(<MemoryRouter><Providers><CardBackDisplayOption /></Providers></MemoryRouter>);
  const radio = screen.getByRole("radio", { name: "Each player’s design", exact: true });
  await waitFor(() => expect(radio).toBeEnabled());
  await userEvent.click(radio);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save display");
  expect(screen.getByRole("radio", { name: "One design everywhere", exact: true })).toBeChecked();
  expect(account.card_backs?.golf).toBe("ginkgo");
  fail = false;
  await userEvent.click(radio);
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(radio).toBeChecked();
});
