import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { App, Providers } from "@/App";
import { AccountSummary } from "@/components/AccountSummary";
import { projectTable } from "@/hooks/useServerGolfTable";
import { useGolfRoom } from "@/hooks/useGolfRoom";
import { statisticsFixture, roomFixture } from "@/test/golfFixtures";
import { recordResult } from "@/lib/results";
import { createGame } from "@/game/engine";
import { StrictMode } from "react";
import { LobbyRoom } from "@/components/LobbyRoom";

const transport = vi.hoisted(() => ({ handlers: {} as Record<string, (...args: any[]) => void>, options: null as any, calls: [] as unknown[], reply: null as any,
  deferSubscribe: false, subscribe: null as ((reply: unknown) => void) | null }));
vi.mock("socket.io-client", () => ({ io: (namespace: string, options: any) => {
  transport.calls.push(namespace); transport.options = options;
  const socket = {
    on: (name: string, fn: (...args: any[]) => void) => { transport.handlers[name] = fn; return socket; },
    connect: () => transport.handlers.connect?.(),
    emit: (_: string, payload: unknown, ack: (reply: unknown) => void) => {
      transport.calls.push(payload);
      if (transport.deferSubscribe) transport.subscribe = ack;
      else ack({ ok: true, state: transport.reply || roomFixture() });
    },
    disconnect: vi.fn(), removeAllListeners: vi.fn(),
  }; return socket;
} }));
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const account = { id: "1", name: "Emily", profile_icon: "cat" };
beforeEach(() => {
  transport.handlers = {}; transport.calls = []; transport.options = null; transport.reply = null;
  transport.deferSubscribe = false; transport.subscribe = null;
});

it("keeps the local player at seat zero and rotates turns, scores and animation anchors consistently", () => {
  const state = roomFixture(4, 2);
  state.game!.turn = 3; state.game!.starter = 1; state.game!.finalTurns = [3, 0]; state.game!.history = [[10, 20, 30, 40]];
  state.motion = { kind: "discard", seat: 3, from: "card-3-4", to: "discard", index: 4, source: "deck", flip: false, card: { id: "draw", rank: "2", suit: "S" } };
  const result = projectTable(state);
  expect(result.participants.map(p => p.name)).toEqual(["Friend 2", "Friend 3", "Friend 0", "Friend 1"]);
  expect(result.game.turn).toBe(1); expect(result.game.starter).toBe(3);
  expect(result.game.history).toEqual([[30, 40, 10, 20]]); expect(result.game.finalTurns).toEqual([1, 2]);
  expect(result.motion?.from).toBe("card-1-4"); expect(result.motion?.seat).toBe(1);
  expect(result.game.players[0].cards[0].card.id).toBe(state.game!.players[2].cards[0].card.id);
});

it.each([false, true])("uses server host status for end-game replays and follows new games (host=%s)", async isHost => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  const finished = roomFixture(3, isHost ? 0 : 1);
  finished.game!.phase = "game-over";
  finished.game!.hole = 9;
  finished.game!.history = Array.from({ length: 9 }, () => [1, 2, 3]);
  finished.game!.players.forEach(player => player.cards.forEach(card => { card.faceUp = true; }));
  transport.reply = finished;
  const next = roomFixture(3, finished.mySeat);
  next.revision = finished.revision + 1;
  const actions: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf" });
    if (path.endsWith("/actions")) {
      actions.push(JSON.parse(String(init.body)).action);
      return response({ state: next });
    }
    return response({ state: finished });
  }));
  render(<MemoryRouter initialEntries={["/game/multiplayer/ABC234"]}><Providers><App /></Providers></MemoryRouter>);
  await screen.findByRole("dialog", {}, { timeout: 10000 });
  if (isHost) {
    act(() => { transport.handlers.disconnect(); });
    expect(screen.getByRole("button", { name: "Starting game…" })).toBeDisabled();
    act(() => { transport.handlers.connect(); });
    fireEvent.click(screen.getByRole("button", { name: "Play Again", exact: true }));
    await waitFor(() => expect(actions).toEqual(["restart"]));
  } else {
    const waiting = screen.getByRole("button", { name: "Waiting for host…" });
    expect(waiting).toBeDisabled();
    fireEvent.click(waiting);
    expect(actions).toEqual([]);
    act(() => { transport.handlers["golf:state"](next); });
  }
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("main", { name: "3-player Golf table" })).toBeVisible();
}, 10000);

it.each([false, true])("leaves the lobby from final results while disconnected and allows retry after failure (host=%s)", async isHost => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  const finished = roomFixture(3, isHost ? 0 : 1);
  finished.game!.phase = "game-over";
  finished.game!.hole = 9;
  finished.game!.history = Array.from({ length: 9 }, () => [1, 2, 3]);
  finished.game!.players.forEach(player => player.cards.forEach(card => { card.faceUp = true; }));
  transport.reply = finished;
  const actions: string[] = [];
  let finishLeave!: (result: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf" });
    if (path === "/api/golf/active") return response({ rooms: [] });
    if (path.endsWith("/actions")) {
      actions.push(JSON.parse(String(init.body)).action);
      if (actions.length === 1) return response({ error: "Couldn’t leave the lobby. Please retry.", code: "LEAVE_FAILED" }, 500);
      return new Promise<Response>(resolve => { finishLeave = resolve; });
    }
    return response({ state: finished });
  }));
  render(<MemoryRouter initialEntries={["/game/multiplayer/ABC234"]}><Providers><App /></Providers></MemoryRouter>);
  const dialog = await screen.findByRole("dialog", {}, { timeout: 10000 });
  act(() => { transport.handlers.connect_error(); });
  expect(within(dialog).getByRole("button", { name: isHost ? "Starting game…" : "Waiting for host…" })).toBeDisabled();
  const leave = within(dialog).getByRole("button", { name: "Leave Lobby", exact: true });
  expect(leave).toBeEnabled();
  fireEvent.click(leave);
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn’t leave the lobby. Please retry.");
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(leave).toBeEnabled();
  fireEvent.click(leave);
  await waitFor(() => expect(finishLeave).toBeDefined());
  expect(leave).toBeDisabled();
  fireEvent.click(leave);
  expect(actions).toEqual(["leave", "leave"]);
  await act(async () => { finishLeave(response({ state: { left: true } })); });
  await waitFor(() => expect(screen.getByRole("heading", { name: "PLAY", exact: true })).toBeVisible());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}, 10000);

it("shows server account totals under All Time and exactly two separate categories, without importing local scores", async () => {
  const local = createGame(2);
  recordResult({ ...local, phase: "game-over", hole: 9, history: Array.from({ length: 9 }, () => [1, 2]) }, "1");
  const fetcher = vi.fn(async (path: string) => path === "/api/golf/stats" ? response({ statistics: statisticsFixture(2, 3) }) : response({ user: account, csrf_token: "shared" }));
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter><Providers><AccountSummary userId="1" /></Providers></MemoryRouter>);
  const stats = await screen.findByLabelText("Your statistics");
  const played = () => within(stats).getByText("Games Played").nextElementSibling;
  expect(played()).toHaveTextContent("5");
  expect(screen.getByRole("button", { name: "All Time" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("group", { name: "Statistics category" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Separate", exact: true }));
  expect(within(screen.getByRole("group", { name: "Statistics category" })).getAllByRole("button")).toHaveLength(2);
  expect(played()).toHaveTextContent("2");
  fireEvent.click(screen.getByRole("button", { name: "Multiplayer", exact: true }));
  expect(played()).toHaveTextContent("3");
  fireEvent.click(screen.getByRole("button", { name: "All Time", exact: true }));
  expect(played()).toHaveTextContent("5");
  expect(fetcher.mock.calls.filter(([path]) => path === "/api/golf/stats")).toHaveLength(1);
  expect(fetcher.mock.calls.every(([, init]) => !init || !(init as RequestInit).body)).toBe(true);
});

it("shows global Bot and Multiplayer monthly and all-time wins to guests and recovers from a service error", async () => {
  let fail = true;
  const fetcher = vi.fn(async (path: string) => {
    if (path.startsWith("/api/golf/leaderboard")) {
      if (fail) return response({ error: "Scores are unavailable." }, 503);
      const name = path.endsWith("bot") ? "CloverFan" : "BirdieFan";
      return response({ monthly: [{ rank: 1, username: name, profile_icon: "cat", games_won: 8 }], all_time: [] });
    }
    return response({ user: null, csrf_token: "shared" });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter initialEntries={["/leaderboard"]}><Providers><App /></Providers></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Scores are unavailable.");
  const tabs = screen.getByRole("group", { name: "Leaderboard category" });
  expect(within(tabs).getAllByRole("button")).toHaveLength(3);
  fail = false; fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByText("CloverFan")).toBeVisible());
  expect(screen.getByText("8 wins")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Multiplayer" }));
  expect(await screen.findByText("BirdieFan")).toBeVisible();
  expect(screen.queryByText("CloverFan")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "All-Time leaderboard" })).toHaveTextContent("No winners yet");
});

it("uses Golf's own socket and fresh Golf CSRF, drops old room updates and resynchronizes stale moves", async () => {
  const calls: { path: string; init: RequestInit }[] = [];
  const newer = { ...roomFixture(), revision: 8 };
  let current = roomFixture();
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf-only-token" });
    if (path.endsWith("/actions")) {
      if (JSON.parse(String(init.body)).action === "leave") return response({ error: "You already left.", code: "NOT_SEATED" }, 403);
      current = newer; return response({ error: "The table changed.", code: "STALE_STATE" }, 409);
    }
    return response({ state: current });
  }));
  let room!: ReturnType<typeof useGolfRoom>;
  function Probe() { room = useGolfRoom("ABC234"); return <p>{room.state?.revision}</p>; }
  render(<MemoryRouter><Providers><Probe /></Providers></MemoryRouter>);
  await waitFor(() => expect(room.connected).toBe(true));
  expect(transport.calls[0]).toBe("/golf"); expect(transport.options.path).toBe("/golf/socket.io");
  await act(async () => { await room.command("draw", { source: "deck" }); });
  expect(room.state?.revision).toBe(8);
  expect(room.error).toBe("The table changed.");
  const move = calls.find(call => call.path.endsWith("/actions"))!;
  expect(new Headers(move.init.headers).get("X-Golf-CSRF")).toBe("golf-only-token");
  expect(JSON.parse(String(move.init.body))).toMatchObject({ action: "draw", revision: 4, source: "deck" });
  expect(JSON.parse(String(move.init.body))).not.toHaveProperty("user_id");
  act(() => { transport.handlers["golf:state"](roomFixture()); });
  expect(room.state?.revision).toBe(8);
  await act(async () => { expect(await room.command("leave")).toBe(true); });
});

it("creates a friend lobby and displays actual participant names without a difficulty setting", async () => {
  const lobby = { ...roomFixture(3, 0), game: null, stage: "lobby" };
  transport.reply = lobby;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/golf/active") return response({ rooms: [] });
    if (path === "/api/account/session") return response({ user: null, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: null, csrf_token: "golf" });
    return response({ state: lobby });
  }));
  render(<MemoryRouter initialEntries={["/game/create"]}><Providers><App /></Providers></MemoryRouter>);
  fireEvent.click(screen.getByRole("radio", { name: "Online", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "3 Players" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Create Game", exact: true })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Create Game", exact: true }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Code", exact: true })).toBeVisible());
  expect(screen.getByRole("textbox", { name: "Code", exact: true })).toHaveValue("ABC234");
  expect(screen.queryByText(/difficulty/i)).not.toBeInTheDocument();
});

it("opens signed-in bot tables directly from creation while the socket subscribes", async () => {
  const botRoom = { ...roomFixture(2, 0), mode: "bot" };
  transport.reply = botRoom;
  transport.deferSubscribe = true;
  const creates: Record<string, unknown>[] = [];
  const fetcher = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === "/api/golf/active") return response({ rooms: [] });
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf" });
    if (path === "/api/golf/bots") creates.push(JSON.parse(String(init.body)));
    return response({ state: botRoom });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<StrictMode><MemoryRouter initialEntries={["/game/single?players=2"]}><Providers><App /></Providers></MemoryRouter></StrictMode>);
  expect(await screen.findByRole("main", { name: "2-player Golf table" })).toBeInTheDocument();
  expect(screen.queryByText("JOINING TABLE")).not.toBeInTheDocument();
  expect(screen.queryByText("Finding your table…")).not.toBeInTheDocument();
  expect(screen.queryByText("Reconnecting to your table…")).not.toBeInTheDocument();
  expect(fetcher.mock.calls.some(([path]) => path === "/api/golf/rooms/ABC234")).toBe(false);
  expect(screen.getByRole("button", { name: /Draw from deck/ })).toBeDisabled();
  act(() => { transport.subscribe!({ ok: true, state: botRoom }); });
  expect(screen.getByRole("button", { name: /Draw from deck/ })).toBeEnabled();
  expect(creates.length).toBeGreaterThan(0);
  expect(new Set(creates.map(payload => payload.requestId)).size).toBe(1);
  expect(creates.every(payload => payload.players === 2 && Object.keys(payload).sort().join(",") === "players,requestId")).toBe(true);
  expect(localStorage.getItem("golf.results.1")).toBeNull();
  act(() => { transport.handlers.disconnect(); });
  expect(screen.getByText(/Reconnecting to your table… Your seat is saved/)).toHaveAttribute("role", "status");
  act(() => { transport.handlers.connect_error(); });
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t connect to your table.");
});

it("resumes saved bot tables without showing the multiplayer joining screen", async () => {
  const botRoom = { ...roomFixture(2, 0), mode: "bot" as const };
  transport.reply = botRoom;
  let resolveRoom!: (response: Response) => void;
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf" });
    return new Promise<Response>(resolve => { resolveRoom = resolve; });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter initialEntries={["/game/single?players=2&room=ABC234"]}><Providers><App /></Providers></MemoryRouter>);
  await waitFor(() => expect(resolveRoom).toBeDefined());
  expect(screen.getByRole("main", { name: "Preparing your table" })).toHaveAttribute("aria-busy", "true");
  expect(screen.queryByText("JOINING TABLE")).not.toBeInTheDocument();
  expect(screen.queryByText("Finding your table…")).not.toBeInTheDocument();
  await act(async () => { resolveRoom(response({ state: botRoom })); });
  expect(await screen.findByRole("main", { name: "2-player Golf table" })).toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([path]) => path === "/api/golf/rooms/ABC234")).toHaveLength(1);
  expect(fetcher.mock.calls.some(([path]) => path === "/api/golf/bots")).toBe(false);
});

it("confirms a server bot concession and keeps a failed attempt available to retry", async () => {
  const botRoom = { ...roomFixture(2, 0), mode: "bot" as const };
  transport.reply = botRoom;
  const actions: string[] = [];
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf" });
    if (path === "/api/golf/active") return response({ rooms: [] });
    if (path.endsWith("/actions")) {
      actions.push(JSON.parse(String(init.body)).action);
      return fail ? response({ error: "Please try again.", code: "REJECTED" }, 409) : response({ state: { left: true } });
    }
    return response({ state: botRoom });
  }));
  render(<MemoryRouter initialEntries={["/game/single?players=2&room=ABC234"]}><Providers><App /></Providers></MemoryRouter>);
  await screen.findByRole("main", { name: "2-player Golf table" });
  const open = () => {
    fireEvent.click(screen.getByLabelText("Game information and scorecard"));
    fireEvent.click(screen.getByRole("button", { name: "Concede", exact: true }));
  };
  open();
  expect(screen.getByRole("dialog", { name: "Concede the game?" })).toHaveTextContent("Are you sure you want to concede?");
  expect(actions).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Keep playing", exact: true }));
  expect(actions).toEqual([]);
  open();
  const dialog = within(screen.getByRole("dialog", { name: "Concede the game?" }));
  act(() => { transport.handlers.disconnect(); });
  expect(dialog.getByRole("button", { name: "Concede", exact: true })).toBeDisabled();
  act(() => { transport.handlers.connect(); });
  fireEvent.click(dialog.getByRole("button", { name: "Concede", exact: true }));
  expect(await dialog.findByRole("alert")).toHaveTextContent("Please try again.");
  expect(actions).toEqual(["leave"]);
  fail = false;
  fireEvent.click(dialog.getByRole("button", { name: "Concede", exact: true }));
  expect(await screen.findByRole("heading", { name: "PLAY", exact: true })).toBeInTheDocument();
  expect(actions).toEqual(["leave", "leave"]);
});

it("sends a direct new-table link to Play when an unfinished room already exists", async () => {
  const saved = { ...roomFixture(2, 0), mode: "bot" as const };
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/active") return response({ rooms: [saved] });
    return response({ user: account, csrf_token: "golf" });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter initialEntries={["/game/single?players=6"]}><Providers><App /></Providers></MemoryRouter>);
  expect(await screen.findByRole("dialog", { name: "Game In Progress" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "PLAY" })).toBeInTheDocument();
  expect(fetcher.mock.calls.some(([path]) => path === "/api/golf/bots")).toBe(false);
});

function lobbyProbe(capacity = 6, host = true) {
  const state = { ...roomFixture(2, host ? 0 : 1), capacity, game: null, stage: "lobby" as const, isHost: host };
  const room = { state, error: "", connected: true, pending: false, command: vi.fn(async () => true), retry: vi.fn(), needsJoin: false };
  vi.stubGlobal("fetch", vi.fn(async () => response({ user: null, csrf_token: "account" })));
  return room;
}

it.each([2, 3, 4, 5, 6])("shows %i lobby seats, code and share URL, and starts with just the players present by default", capacity => {
  const room = lobbyProbe(capacity);
  render(<MemoryRouter><Providers><LobbyRoom room={room} /></Providers></MemoryRouter>);
  expect(within(screen.getByRole("list", { name: "Players in lobby" })).getAllByRole("listitem")).toHaveLength(capacity);
  expect(screen.getByRole("textbox", { name: "Code", exact: true })).toHaveValue("ABC234");
  expect(screen.getByRole("textbox", { name: "URL", exact: true }).getAttribute("value")).toMatch(/\/game\/lobby\/ABC234$/);
  expect(screen.getByRole("button", { name: "Copy Code" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy URL" })).toBeInTheDocument();
  if (capacity > 2) expect(screen.getByRole("radio", { name: "Just 2 players" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Start Game", exact: true }));
  expect(room.command).toHaveBeenCalledWith("start", { fillBots: false });
});

it("fills empty seats only when the host chooses bots", () => {
  const room = lobbyProbe();
  render(<MemoryRouter><Providers><LobbyRoom room={room} /></Providers></MemoryRouter>);
  fireEvent.click(screen.getByRole("radio", { name: "Fill with bots" }));
  fireEvent.click(screen.getByRole("button", { name: "Start Game", exact: true }));
  expect(room.command).toHaveBeenCalledWith("start", { fillBots: true });
});

it.each([["Leave Lobby", "leave"], ["Close Lobby", "close"]])("keeps %s as a distinct lobby action", async (label, action) => {
  const room = lobbyProbe();
  render(<MemoryRouter><Providers><LobbyRoom room={room} /></Providers></MemoryRouter>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: label, exact: true })); });
  expect(room.command).toHaveBeenCalledWith(action);
});

it("lets guests leave, reserves Close Lobby for the host, and explains when the host closes it", () => {
  const room = lobbyProbe(6, false);
  const view = render(<MemoryRouter><Providers><LobbyRoom room={room} /></Providers></MemoryRouter>);
  expect(screen.getByRole("button", { name: "Leave Lobby" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Close Lobby" })).not.toBeInTheDocument();
  view.rerender(<MemoryRouter><Providers><LobbyRoom room={{ ...room, state: { ...room.state, closed: true } }} /></Providers></MemoryRouter>);
  expect(screen.getByRole("status")).toHaveTextContent("The host closed this lobby.");
  expect(screen.queryByRole("list", { name: "Players in lobby" })).not.toBeInTheDocument();
});

it("lets a friend join directly from a shared lobby URL", async () => {
  const lobby = { ...roomFixture(3, 1), game: null, stage: "lobby" };
  transport.reply = lobby;
  let joined = false;
  const fetcher = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === "/api/account/session") return response({ user: null, csrf_token: "account" });
    if (path === "/api/golf/session") return response({ user: null, csrf_token: "golf" });
    if (path === "/api/golf/lobbies/join") { joined = true; return response({ state: lobby }); }
    return joined ? response({ state: lobby }) : response({ error: "You are not seated.", code: "NOT_SEATED" }, 403);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter initialEntries={["/game/lobby/ABC234"]}><Providers><App /></Providers></MemoryRouter>);
  const button = await screen.findByRole("button", { name: "Join Lobby", exact: true });
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), { target: { value: "Friend" } });
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Code", exact: true })).toHaveValue("ABC234"));
  const joinedRequest = fetcher.mock.calls.find(([path]) => path === "/api/golf/lobbies/join")!;
  expect(JSON.parse(String(joinedRequest[1].body))).toEqual({ code: "ABC234", name: "Friend" });
});

it("shows and clears the inactivity warning, then explains removal", async () => {
  const room = { ...roomFixture(3, 0), idleWarning: true };
  transport.reply = room;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf" });
    return response({ state: room });
  }));
  render(<MemoryRouter initialEntries={["/game/lobby/ABC234"]}><Providers><App /></Providers></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("removed for inactivity in 1 minute");
  act(() => transport.handlers["golf:state"]({ ...room, revision: room.revision + 1, idleWarning: false }));
  expect(screen.queryByText(/removed for inactivity/)).not.toBeInTheDocument();
  act(() => transport.handlers["golf:removed"]({ code: room.code, reason: "idle" }));
  expect(screen.getByRole("alert")).toHaveTextContent("You were removed for inactivity.");
  expect(screen.queryByText(/bot has taken your seat/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Draw from deck/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to Play" })).toBeInTheDocument();
});

it.each([false, true])("returns to the open lobby when the other player leaves (reload=%s)", async reload => {
  const room = roomFixture(2, 0);
  const lobby = { ...room, revision: room.revision + 1, lobbyReason: "not_enough_players",
    stage: "lobby", mySeat: 0, seats: room.seats.slice(0, 1), game: null, motion: null };
  transport.reply = reload ? lobby : room;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf" });
    if (path === "/api/golf/active") return response({ rooms: [] });
    return response({ state: reload ? lobby : room });
  }));
  render(<MemoryRouter initialEntries={["/game/multiplayer/ABC234"]}><Providers><App /></Providers></MemoryRouter>);
  if (!reload) {
    expect(await screen.findByRole("main", { name: "2-player Golf table" })).toBeInTheDocument();
    act(() => transport.handlers["golf:state"](lobby));
  }
  await waitFor(() => {
    expect(screen.getByText("GAME LOBBY")).toBeInTheDocument();
    expect(screen.getByText(/Your lobby is still open/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("textbox", { name: "Code", exact: true })).toHaveValue(room.code);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close Lobby" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Draw from deck/ })).not.toBeInTheDocument();
  });
  act(() => transport.handlers["golf:state"]({ ...lobby, revision: lobby.revision + 1, seats: room.seats }));
  expect(screen.getByRole("button", { name: "Start Game" })).toBeEnabled();
});

it("reduces the visible table when a player leaves a three-player game", async () => {
  const room = roomFixture(3, 2);
  transport.reply = room;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: account, csrf_token: "golf" });
    return response({ state: room });
  }));
  render(<MemoryRouter initialEntries={["/game/multiplayer/ABC234"]}><Providers><App /></Providers></MemoryRouter>);
  expect(await screen.findByRole("main", { name: "3-player Golf table" })).toBeInTheDocument();
  act(() => transport.handlers["golf:state"]({ ...room, revision: room.revision + 1, capacity: 2, mySeat: 1,
    seats: room.seats.slice(1), game: { ...room.game!, players: room.game!.players.slice(1), turn: 1, starter: 0 } }));
  expect(screen.getByRole("main", { name: "2-player Golf table" })).toBeInTheDocument();
  expect(screen.queryByText("Friend 0")).not.toBeInTheDocument();
  expect(screen.getAllByText("Friend 1").length).toBeGreaterThan(0);
});
