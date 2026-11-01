import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Play, CreateGame, JoinGame } from "./Play";
import { createGame } from "@/game/engine";
import { readLocalGame, saveLocalGame } from "@/lib/localGame";
import type { RoomState } from "@/lib/golfApi";
import { roomFixture } from "@/test/golfFixtures";

const auth = vi.hoisted(() => ({
  user: null as { id: string; name: string } | null,
  loading: false,
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/LoginWarning", () => ({ LoginWarning: () => null }));

let rooms: RoomState[];
let fetcher: ReturnType<typeof vi.fn>;
let lookup: ReturnType<typeof vi.fn>;
let leave: ReturnType<typeof vi.fn>;
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const mutations = () =>
  fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
const button = (name: string) =>
  screen.getByRole("button", { name, exact: true });
const createLink = () => screen.getByRole("link", { name: /^Create Game/ });

beforeEach(() => {
  auth.user = null;
  auth.loading = false;
  rooms = [];
  lookup = vi.fn(async () => response({ rooms }));
  leave = vi.fn(async (path: string) => {
    rooms = rooms.filter((room) => !path.includes(room.code));
    return response({ state: { left: true } });
  });
  fetcher = vi.fn(async (path: string, init: RequestInit = {}) => {
    if (path === "/api/golf/active") return lookup();
    if (path === "/api/golf/session")
      return response({ csrf_token: "fresh-golf-token", user: auth.user });
    if (path.endsWith("/actions")) return leave(path, init);
    const room = rooms.find((room) => path.endsWith(`/rooms/${room.code}`));
    if (room) return response({ state: room });
    if (path === "/api/golf/lobbies" || path === "/api/golf/lobbies/join")
      return response({ state: roomFixture() });
    return response(
      { code: "NOT_SEATED", error: "You already left this table." },
      403
    );
  });
  vi.stubGlobal("fetch", fetcher);
});

function Destination() {
  const location = useLocation();
  return <p data-testid="destination">{location.pathname + location.search}</p>;
}
function page(entry = "/play") {
  return (
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/play" element={<Play />} />
          <Route path="/game/create" element={<CreateGame />} />
          <Route path="/game/join" element={<JoinGame />} />
          <Route path="/game/single" element={<Destination />} />
          <Route path="/game/lobby/:code" element={<Destination />} />
          <Route path="/game/multiplayer/:code" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}
const solo = () => ({ ...roomFixture(4, 0), mode: "bot" as const });
const lobby = () => ({ ...roomFixture(), game: null, stage: "lobby" as const });
function local() {
  const saved = {
    game: createGame(5),
    stage: "opening" as const,
    motion: null,
    pickerTick: 0,
    openingBusy: false,
  };
  saveLocalGame(saved);
  return saved;
}

it("shows all unfinished games as cards without blocking Create or Join", async () => {
  rooms = [solo(), { ...roomFixture(), code: "FRIEND" }, lobby()];
  render(page());
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(createLink()).not.toHaveAttribute("aria-disabled");
  expect(screen.getAllByRole("button", { name: "Resume" })).toHaveLength(2);
  expect(mutations()).toHaveLength(0);
});

it("resumes the selected original server game without creating or conceding it", async () => {
  rooms = [solo()];
  auth.user = { id: "1", name: "Player 1" };
  render(page());
  await userEvent.click(await screen.findByRole("button", { name: "Resume" }));
  expect(await screen.findByTestId("destination")).toHaveTextContent(
    `/game/single?players=4&room=${rooms[0].code}`
  );
  expect(mutations()).toHaveLength(0);
});

it("lists multiple guest saves and resumes the chosen game by its own ID", async () => {
  const first = local();
  const second = { ...first, game: createGame(3) };
  saveLocalGame(second);
  render(page());
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  const card = within(screen.getByRole("article", { name: /5 players/ }));
  await userEvent.click(card.getByRole("button", { name: "Resume" }));
  expect(await screen.findByTestId("destination")).toHaveTextContent(
    `game=${first.game.id}`
  );
  expect(readLocalGame(first.game.id)?.game.id).toBe(first.game.id);
});

it("confirms a concession inside only the selected card and preserves the other game", async () => {
  rooms = [solo(), { ...solo(), code: "SECOND" }];
  render(page());
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  const cards = screen.getAllByRole("article"),
    card = within(cards[1]);
  await userEvent.click(card.getByRole("button", { name: "Concede" }));
  expect(leave).not.toHaveBeenCalled();
  await userEvent.click(card.getByRole("button", { name: "Keep game" }));
  expect(leave).not.toHaveBeenCalled();
  await userEvent.click(card.getByRole("button", { name: "Concede" }));
  await userEvent.click(card.getByRole("button", { name: "Concede" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
  expect(rooms).toHaveLength(1);
  expect(rooms[0].code).not.toBe("SECOND");
  expect(JSON.parse(mutations()[0][1].body as string)).toMatchObject({
    action: "leave",
    revision: 4,
  });
});

it("retains the game and permits a retry if conceding fails", async () => {
  rooms = [solo()];
  leave.mockResolvedValue(
    response({ error: "Reconnect before conceding", code: "UNAVAILABLE" }, 503)
  );
  render(page());
  const card = within(await screen.findByRole("article"));
  await userEvent.click(card.getByRole("button", { name: "Concede" }));
  await userEvent.click(card.getByRole("button", { name: "Concede" }));
  await waitFor(() => expect(screen.getByRole("article")).toBeInTheDocument());
  await waitFor(() =>
    expect(card.getByRole("button", { name: "Concede" })).toBeEnabled()
  );
  // The room API retries unavailable/stale writes with the same action identity.
  expect(leave).toHaveBeenCalled();
});

it("does not display waiting lobbies or completed multiplayer groups", async () => {
  const finished = roomFixture();
  finished.game!.phase = "game-over";
  rooms = [lobby(), finished];
  render(page());
  await waitFor(() =>
    expect(createLink()).not.toHaveAttribute("aria-disabled")
  );
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps saved games private across an account change and ignores the old lookup", async () => {
  auth.user = { id: "1", name: "First" };
  let complete!: (response: Response) => void;
  lookup.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      })
  );
  const view = render(page());
  auth.user = { id: "2", name: "Second" };
  view.rerender(page());
  await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
  await act(async () => complete(response({ rooms: [solo()] })));
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

it("keeps multiple saves when creating another game", async () => {
  rooms = [solo()];
  render(page("/game/create"));
  await waitFor(() => expect(button("Create Game")).toBeEnabled());
  await userEvent.click(button("Create Game"));
  expect(await screen.findByTestId("destination")).toHaveTextContent("new=1");
  expect(leave).not.toHaveBeenCalled();
});
