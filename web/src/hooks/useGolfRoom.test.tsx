import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "@/context/AuthContext";
import { useGolfRoom } from "./useGolfRoom";
import { roomFixture } from "@/test/golfFixtures";
import type { RoomState } from "@/lib/golfApi";

const transport = vi.hoisted(() => ({ sockets: [] as any[], reply: null as any }));
vi.mock("socket.io-client", () => ({ io: () => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const socket = {
    handlers,
    on: (name: string, fn: (...args: any[]) => void) => { handlers[name] = fn; return socket; },
    connect: vi.fn(() => handlers.connect?.()),
    emit: vi.fn((_name: string, _payload: unknown, ack: (reply: unknown) => void) => ack(transport.reply)),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
  };
  transport.sockets.push(socket);
  return socket;
} }));

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const signedIn = { id: "2", name: "Friend", profile_icon: "cat" };
let room: ReturnType<typeof useGolfRoom>;

function Probe() {
  room = useGolfRoom("ABC234");
  return null;
}

beforeEach(() => { transport.sockets = []; transport.reply = null; });

it("reconnects a sleeping phone with the saved room and fetches the latest state", async () => {
  const lobby: RoomState = { ...roomFixture(), game: null, stage: "lobby" };
  transport.reply = { ok: true, state: lobby };
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/account/session"
    ? response({ user: null, csrf_token: "shared" }) : response({ state: lobby })));
  const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(room.connected).toBe(true));
  const socket = transport.sockets.at(-1);
  const initialConnects = socket.connect.mock.calls.length;
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(socket.connect).toHaveBeenCalledTimes(initialConnects);
  transport.reply = { ok: true, state: { ...lobby, revision: lobby.revision + 1 } };
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(socket.disconnect).toHaveBeenCalledOnce();
  expect(socket.connect).toHaveBeenCalledTimes(initialConnects + 1);
  expect(room.state?.revision).toBe(lobby.revision + 1);
  expect(room.state?.mySeat).toBe(lobby.mySeat);
  unmount();
  act(() => window.dispatchEvent(new Event("online")));
  expect(socket.connect).toHaveBeenCalledTimes(initialConnects + 1);
});

it("resumes the same seat with the updated account after signing in from another tab", async () => {
  const lobby: RoomState = { ...roomFixture(), game: null, stage: "lobby" };
  lobby.seats[1].name = "Guest";
  let account: typeof signedIn | null = null;
  let current = lobby;
  transport.reply = { ok: true, state: current };
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/account/session") return response({ user: account, csrf_token: "shared" });
    return response({ state: current });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(room.connected).toBe(true));
  expect(room.state?.seats[1].name).toBe("Guest");
  const oldSocket = transport.sockets.at(-1);
  account = signedIn;
  current = { ...lobby, revision: lobby.revision + 1, seats: lobby.seats.map((seat, i) => i === 1 ? { ...seat, name: "Friend" } : seat) };
  transport.reply = { ok: true, state: current };
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => {
    expect(oldSocket.disconnect).toHaveBeenCalled();
    expect(room.state?.seats[1].name).toBe("Friend");
  });
  expect(room.state?.mySeat).toBe(1);
  expect(room.state?.seats).toHaveLength(3);
  expect(room.needsJoin).toBe(false);
  expect(oldSocket.disconnect).toHaveBeenCalled();
  expect(fetcher.mock.calls.some(([path]) => path === "/api/golf/lobbies/join")).toBe(false);
});

it.each(["subscription", "notification"])("offers to rejoin an expired lobby seat after a %s", async source => {
  const lobby: RoomState = { ...roomFixture(), game: null, stage: "lobby" };
  transport.reply = { ok: true, state: lobby };
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/account/session"
    ? response({ user: null, csrf_token: "shared" }) : response({ state: lobby })));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(room.connected).toBe(true));
  act(() => {
    const socket = transport.sockets.at(-1);
    if (source === "notification") socket.handlers["golf:removed"]({ reason: "disconnected" });
    else {
      transport.reply = { ok: false, code: "NOT_SEATED", error: "You are not seated at this table." };
      socket.handlers.connect();
    }
  });
  expect(room.connected).toBe(false);
  expect(room.state).toBeNull();
  expect(room.needsJoin).toBe(true);
  expect(room.removedReason).toBeNull();
});

it("keeps in-game disconnect removal final", async () => {
  const game = roomFixture();
  transport.reply = { ok: true, state: game };
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/api/account/session"
    ? response({ user: null, csrf_token: "shared" }) : response({ state: game })));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(room.connected).toBe(true));
  act(() => transport.sockets.at(-1).handlers["golf:removed"]({ reason: "disconnected" }));
  expect(room.removedReason).toBe("disconnected");
  expect(room.needsJoin).toBe(false);
});

it("sends the decision from the displayed board and preserves it after a lost response", async () => {
  const game = { ...roomFixture(), actionTokens: { advance: "completed-hole-1" } };
  transport.reply = { ok: true, state: game };
  const payloads: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/account/session") return response({ user: null, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: null, csrf_token: "golf" });
    if (init?.method === "POST") {
      payloads.push(JSON.parse(init.body as string));
      if (payloads.length === 1) throw new TypeError("Lost response");
    }
    return response({ state: game });
  }));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(room.connected).toBe(true));
  await act(async () => { expect(await room.command("advance")).toBe(true); });
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toMatchObject({ action: "advance", actionToken: "completed-hole-1", revision: game.revision });
  expect(payloads[1]).toEqual(payloads[0]);
});

it("does not rebase an old click onto a newer board or retry a stale decision", async () => {
  const old = { ...roomFixture(), actionTokens: { reveal: "first-hole" } };
  let current = old;
  transport.reply = { ok: true, state: old };
  const payloads: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/account/session") return response({ user: null, csrf_token: "shared" });
    if (path === "/api/golf/session") return response({ user: null, csrf_token: "golf" });
    if (init?.method === "POST") {
      payloads.push(JSON.parse(init.body as string));
      return response({ error: "The table changed.", code: "STALE_STATE" }, 409);
    }
    return response({ state: current });
  }));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(room.connected).toBe(true));
  const oldClick = room.command;
  current = { ...old, revision: old.revision + 1, actionTokens: { reveal: "second-hole" } };
  act(() => transport.sockets.at(-1).handlers["golf:state"](current));
  await act(async () => { expect(await oldClick("reveal", { index: 0 })).toBe(false); });
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({ actionToken: "first-hole", revision: old.revision });
  expect(room.state?.revision).toBe(current.revision);
  expect(room.error).toBe("The table changed.");
});
