import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Play, CreateGame, JoinGame } from "./Play";
import { createGame } from "@/game/engine";
import { readLocalGame, saveLocalGame } from "@/lib/localGame";
import type { RoomState } from "@/lib/golfApi";
import { roomFixture } from "@/test/golfFixtures";

const auth = vi.hoisted(() => ({ user: null as { id: string; name: string } | null, loading: false }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/context/SoundContext", () => ({ useSound: () => ({ play: vi.fn() }) }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/LoginWarning", () => ({ LoginWarning: () => null }));

let rooms: RoomState[];
let fetcher: ReturnType<typeof vi.fn>;
let lookup: ReturnType<typeof vi.fn>;
let leave: ReturnType<typeof vi.fn>;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const mutations = () => fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
const button = (name: string) => screen.getByRole("button", { name, exact: true });
const createLink = () => screen.getByRole("link", { name: /^Create Game/ });

beforeEach(() => {
  auth.user = null;
  auth.loading = false;
  rooms = [];
  lookup = vi.fn(async () => response({ rooms }));
  leave = vi.fn(async (path: string) => {
    rooms = rooms.filter(room => !path.includes(room.code));
    return response({ state: { left: true } });
  });
  fetcher = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === "/api/golf/active") return lookup();
    if (path === "/api/golf/session") return response({ csrf_token: "fresh-golf-token", user: auth.user });
    if (path.endsWith("/actions")) return leave(path, init);
    const room = rooms.find(room => path.endsWith(`/rooms/${room.code}`));
    if (room) return response({ state: room });
    if (path === "/api/golf/lobbies" || path === "/api/golf/lobbies/join") return response({ state: roomFixture() });
    return response({ code: "NOT_SEATED", error: "You already left this table." }, 403);
  });
  vi.stubGlobal("fetch", fetcher);
});

function Destination() {
  const location = useLocation();
  return <p data-testid="destination">{location.pathname + location.search}</p>;
}
function page(entry = "/play") {
  return <HelmetProvider><MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/play" element={<Play />} />
    <Route path="/game/create" element={<CreateGame />} />
    <Route path="/game/join" element={<JoinGame />} />
    <Route path="/game/single" element={<Destination />} />
    <Route path="/game/lobby/:code" element={<Destination />} />
    <Route path="/game/multiplayer/:code" element={<Destination />} />
  </Routes></MemoryRouter></HelmetProvider>;
}
const solo = () => ({ ...roomFixture(4, 0), mode: "bot" as const });
const lobby = () => ({ ...roomFixture(), game: null, stage: "lobby" as const });
function local() {
  const saved = { game: createGame(5), stage: "opening" as const, motion: null, pickerTick: 0, openingBusy: false };
  saveLocalGame(saved);
  return saved;
}

it("enables Create and Join only after checking saved sessions, without mutating a game", async () => {
  render(page());
  expect(createLink()).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Checking for an active game");
  fireEvent.click(createLink());
  expect(screen.getByRole("heading", { name: "PLAY" })).toBeInTheDocument();
  await waitFor(() => expect(createLink()).not.toHaveAttribute("aria-disabled"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mutations()).toHaveLength(0);
});

it("waits for account identity before looking up games", async () => {
  auth.loading = true;
  const view = render(page());
  expect(lookup).not.toHaveBeenCalled();
  expect(createLink()).toHaveAttribute("aria-disabled", "true");
  auth.loading = false;
  view.rerender(page());
  await waitFor(() => expect(createLink()).not.toHaveAttribute("aria-disabled"));
  expect(lookup).toHaveBeenCalledOnce();
});

it("keeps the menu and local bot games usable when the background lookup fails", async () => {
  lookup.mockRejectedValue(new TypeError("Failed to fetch"));
  const user = userEvent.setup();
  render(page());
  await waitFor(() => expect(createLink()).not.toHaveAttribute("aria-disabled"));
  expect(screen.getByRole("link", { name: /^Join Game/ })).not.toHaveAttribute("aria-disabled");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  await user.click(createLink());
  await waitFor(() => expect(button("Create Game")).toBeEnabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(button("Create Game"));
  expect(screen.getByTestId("destination")).toHaveTextContent("/game/single?players=2");
  expect(mutations()).toHaveLength(0);
});

it("continues the original signed-in solo room without creating or conceding it", async () => {
  auth.user = { id: "1", name: "Emily" };
  rooms = [solo()];
  const user = userEvent.setup();
  render(page());
  expect(await screen.findByRole("dialog", { name: "Game In Progress" })).toBeInTheDocument();
  await user.click(button("Continue"));
  expect(screen.getByTestId("destination")).toHaveTextContent("/game/single?players=4&room=ABC234");
  expect(mutations()).toHaveLength(0);
});

it("continues a guest's saved five-player table", async () => {
  local();
  const user = userEvent.setup();
  render(page());
  await user.click(button("Continue"));
  expect(screen.getByTestId("destination")).toHaveTextContent("/game/single?players=5");
  expect(mutations()).toHaveLength(0);
});

it("cancels concession, then clears guest progress only after Yes", async () => {
  const saved = local();
  const user = userEvent.setup();
  render(page());
  await user.click(button("Concede"));
  expect(screen.getByRole("dialog", { name: "Are you sure?" })).toHaveTextContent("progress in this game will be lost");
  expect(button("No")).toHaveFocus();
  await user.click(button("No"));
  expect(readLocalGame()?.game.id).toBe(saved.game.id);
  expect(screen.getByRole("dialog", { name: "Game In Progress" })).toBeInTheDocument();
  await user.click(button("Concede"));
  await user.click(button("Yes"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(readLocalGame()).toBeNull();
  expect(mutations()).toHaveLength(0);
  expect(createLink()).not.toHaveAttribute("aria-disabled");
});

it("explains that a server solo concession does not count and sends a fresh revision and CSRF", async () => {
  rooms = [solo()];
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog");
  await user.click(button("Concede"));
  expect(screen.getByRole("dialog")).toHaveTextContent("Only finished games count toward your statistics.");
  expect(mutations()).toHaveLength(0);
  rooms[0].revision = 18;
  await user.click(button("Yes"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const [, init] = mutations()[0];
  expect(JSON.parse(String(init.body))).toMatchObject({ action: "leave", revision: 18 });
  expect(new Headers(init.headers).get("X-Golf-CSRF")).toBe("fresh-golf-token");
});

it.each(["waiting", "playing", "round-over", "finished"])("rejoins the correct destination for an online group that is %s", async status => {
  const state = status === "waiting" ? lobby() : roomFixture();
  if (status === "round-over") state.game!.phase = "round-over";
  if (status === "finished") state.game!.phase = "game-over";
  rooms = [state];
  const playing = status === "playing" || status === "round-over";
  const user = userEvent.setup();
  render(page());
  const dialog = await screen.findByRole("dialog", { name: playing ? "Multiplayer Game In Progress" : "Lobby In Progress" });
  if (status === "finished") expect(dialog).toHaveTextContent("between games");
  await user.click(button("Rejoin"));
  expect(screen.getByTestId("destination")).toHaveTextContent(`/game/${playing ? "multiplayer" : "lobby"}/ABC234`);
  expect(mutations()).toHaveLength(0);
});

it.each(["waiting", "finished"])("leaves a %s lobby without a loss or bot warning", async status => {
  const state = status === "waiting" ? lobby() : roomFixture();
  if (state.game) state.game.phase = "game-over";
  rooms = [state];
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog");
  await user.click(button("Leave"));
  expect(screen.getByRole("dialog")).toHaveTextContent("leave the lobby");
  expect(screen.getByRole("dialog")).not.toHaveTextContent(/loss|bot will/i);
  await user.click(button("Yes"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("keeps the multiplayer confirmation busy until the server acknowledges leaving", async () => {
  rooms = [roomFixture()];
  let finish!: (response: Response) => void;
  leave.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog");
  await user.click(button("Leave"));
  expect(screen.getByRole("dialog")).toHaveTextContent("Your seat will be removed");
  expect(screen.getByRole("dialog")).toHaveTextContent("If one player remains, they’ll return to the open lobby to invite others.");
  expect(screen.getByRole("dialog")).toHaveTextContent("Only finished games count toward your statistics.");
  await user.click(button("Yes"));
  expect(button("Leaving…")).toBeDisabled();
  expect(button("No")).toBeDisabled();
  expect(createLink()).toHaveAttribute("aria-disabled", "true");
  expect(leave).toHaveBeenCalledOnce();
  await act(async () => finish(response({ state: { left: true } })));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(createLink()).not.toHaveAttribute("aria-disabled");
});

it("retains the online game after a failed leave and allows retry or cancellation", async () => {
  rooms = [roomFixture()];
  leave.mockResolvedValueOnce(response({ error: "Please reconnect and try again.", code: "CONNECTION_LOST" }, 503));
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog");
  await user.click(button("Leave"));
  await user.click(button("Yes"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Please reconnect");
  expect(button("Yes")).toBeEnabled();
  expect(createLink()).toHaveAttribute("aria-disabled", "true");
  await user.click(button("No"));
  expect(screen.getByRole("dialog", { name: "Multiplayer Game In Progress" })).toBeInTheDocument();
  await user.click(button("Leave"));
  await user.click(button("Yes"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("retries a changed table using the new revision and the same action identity", async () => {
  rooms = [roomFixture()];
  leave.mockImplementationOnce(async () => {
    rooms[0].revision = 21;
    return response({ error: "The table changed.", code: "STALE_STATE" }, 409);
  });
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog");
  await user.click(button("Leave"));
  await user.click(button("Yes"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const payloads = mutations().map(([, init]) => JSON.parse(String(init.body)));
  expect(payloads.map(payload => payload.revision)).toEqual([4, 21]);
  expect(new Set(payloads.map(payload => payload.actionId)).size).toBe(1);
});

it("recovers when the leave succeeded but its response was lost", async () => {
  rooms = [roomFixture()];
  leave.mockImplementationOnce(async () => { rooms = []; throw new Error("Response lost"); });
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog");
  await user.click(button("Leave"));
  await user.click(button("Yes"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(leave).toHaveBeenCalledOnce();
});

it("handles solo before multiplayer and resets confirmation when advancing to the next saved session", async () => {
  rooms = [lobby(), { ...solo(), code: "DEF567" }];
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog", { name: "Game In Progress" });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  await user.click(button("Concede"));
  await user.click(button("Yes"));
  expect(await screen.findByRole("dialog", { name: "Lobby In Progress" })).toBeInTheDocument();
  expect(button("Rejoin")).toBeEnabled();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(leave.mock.calls[0][0]).toContain("DEF567");
});

it.each(["finished solo", "closed lobby"])("does not block creation for a %s", async kind => {
  const state = kind === "finished solo" ? solo() : { ...lobby(), closed: true };
  if (state.game) state.game.phase = "game-over";
  rooms = [state];
  render(page());
  await waitFor(() => expect(createLink()).not.toHaveAttribute("aria-disabled"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it.each(["/game/create", "/game/join"])("redirects a direct %s visit to the saved-game prompt", async route => {
  rooms = [lobby()];
  render(page(route));
  expect(await screen.findByRole("dialog", { name: "Lobby In Progress" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "PLAY" })).toBeInTheDocument();
  expect(mutations()).toHaveLength(0);
});

it("keeps keyboard focus inside the prompt and focuses No on confirmation", async () => {
  rooms = [solo()];
  const user = userEvent.setup();
  render(page());
  const dialog = await screen.findByRole("dialog");
  expect(button("Continue")).toHaveFocus();
  await user.tab({ shift: true });
  expect(button("Concede")).toHaveFocus();
  await user.tab();
  expect(button("Continue")).toHaveFocus();
  await user.click(button("Concede"));
  expect(within(dialog).getByRole("button", { name: "No" })).toHaveFocus();
});

it("keeps confirmation open when focus refreshes the same session", async () => {
  rooms = [lobby()];
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog");
  await user.click(button("Leave"));
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("dialog", { name: "Are you sure?" })).toBeInTheDocument();
});

it("disables online Leave while offline and keeps Rejoin available", async () => {
  rooms = [lobby()];
  render(page());
  await screen.findByRole("dialog");
  fireEvent(window, new Event("offline"));
  expect(button("Leave")).toBeDisabled();
  expect(button("Rejoin")).toBeEnabled();
  expect(screen.getByRole("alert")).toHaveTextContent("You’re offline");
});

it("discards the previous identity's lookup result after switching accounts", async () => {
  auth.user = { id: "1", name: "Emily" };
  let finish!: (response: Response) => void;
  lookup.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  const view = render(page());
  auth.user = { id: "2", name: "Friend" };
  view.rerender(page());
  await waitFor(() => expect(createLink()).not.toHaveAttribute("aria-disabled"));
  await act(async () => finish(response({ rooms: [solo()] })));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps a delayed refresh from reopening a lobby that was just left", async () => {
  rooms = [lobby()];
  const oldRooms = [...rooms];
  let finish!: (response: Response) => void;
  const user = userEvent.setup();
  render(page());
  await screen.findByRole("dialog");
  await user.click(button("Leave"));
  lookup.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
  await user.click(button("Yes"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await act(async () => finish(response({ rooms: oldRooms })));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(createLink()).not.toHaveAttribute("aria-disabled");
});
