import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App, Providers } from "./App";
import { vi, expect, it, beforeEach } from "vitest";
import { createGame } from "@/game/engine";
import { readResults, recordResult } from "@/lib/results";
import { statisticsFixture } from "@/test/golfFixtures";
const account = {
  id: "shared-id",
  name: "Golfer",
  email: "golfer@example.test",
  profile_icon: "user",
  email_verified: true,
  turn_sound: { golf: false, euchre: false, hearts: false },
};
let current: typeof account | null;
let failLogin: boolean;
let mutations: { path: string; csrf: string | null }[];
let sessionNumber: number;
let fetcher: ReturnType<typeof vi.fn>;
let savedGames: number;
beforeEach(() => {
  savedGames = 0;
  current = null;
  failLogin = false;
  mutations = [];
  sessionNumber = 0;
  fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url === "/api/golf/active")
      return new Response(JSON.stringify({ rooms: [] }));
    if (url === "/api/golf/stats")
      return new Response(
        JSON.stringify({
          statistics: statisticsFixture(
            current?.id === account.id ? savedGames : 0
          ),
        })
      );
    const path = url.replace("/api/account", "");
    if (path === "/session") sessionNumber++;
    else {
      const csrf = new Headers(init.headers).get("X-CSRF-Token");
      mutations.push({ path, csrf });
      if (csrf !== `csrf-${sessionNumber}`) throw new Error("Stale CSRF");
      if (path === "/login") {
        if (failLogin)
          return new Response(
            JSON.stringify({ error: "Check your username and password." }),
            { status: 401 }
          );
        current = account;
      }
      if (path === "/logout") current = null;
      if (path === "/profile" && current) {
        const data = JSON.parse(String(init.body));
        current = data.turn_sound
          ? {
              ...current,
              turn_sound: {
                ...current.turn_sound,
                [data.turn_sound.game]: data.turn_sound.enabled,
              },
            }
          : { ...current, ...data };
      }
      if (path === "/delete") {
        if (JSON.parse(String(init.body)).password !== "delete-password")
          return new Response(
            JSON.stringify({ error: "Check your password." }),
            { status: 401 }
          );
        current = null;
      }
    }
    return new Response(
      JSON.stringify({
        user: current,
        csrf_token: `csrf-${sessionNumber}`,
        ...(path === "/delete" ? { message: "Account deleted." } : {}),
      })
    );
  });
  vi.stubGlobal("fetch", fetcher);
});

function mockAccountDialog() {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
}

it("offers the sister sites' Delete Account button with cancellable, password-protected confirmation", async () => {
  mockAccountDialog();
  current = account;
  const user = userEvent.setup();
  open("/user");
  const remove = await screen.findByRole("button", {
    name: "Delete Account",
    exact: true,
  });
  expect(
    screen.queryByRole("link", { name: "Manage Account at Cards" })
  ).not.toBeInTheDocument();
  await user.click(remove);
  let dialog = screen.getByRole("dialog", {
    name: "Delete Account",
    exact: true,
  });
  expect(
    within(dialog).getByText(/across Cards, Hearts, Euchre, and Golf/)
  ).toBeVisible();
  expect(
    within(dialog).getByRole("button", { name: "No", exact: true })
  ).toHaveFocus();
  await user.click(
    within(dialog).getByRole("button", { name: "No", exact: true })
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(remove).toHaveFocus();
  expect(mutations).toEqual([]);
  await user.click(remove);
  await user.click(screen.getByRole("button", { name: "Yes", exact: true }));
  dialog = screen.getByRole("dialog", { name: "Confirm Deletion" });
  const password = within(dialog).getByLabelText("Password", { exact: true });
  expect(password).toHaveFocus();
  await user.click(
    within(dialog).getByRole("button", { name: "Delete", exact: true })
  );
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    "Please enter your password."
  );
  expect(mutations).toEqual([]);
  await user.type(password, "wrong-password");
  await user.click(
    within(dialog).getByRole("button", { name: "Delete", exact: true })
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Check your password."
  );
  expect(current?.id).toBe(account.id);
  await user.click(
    within(dialog).getByRole("button", { name: "Nevermind", exact: true })
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("deletes through the shared service with fresh CSRF and clears only the deleted user's Golf results", async () => {
  mockAccountDialog();
  current = account;
  const game = createGame(2);
  const completed = {
    ...game,
    phase: "game-over" as const,
    hole: 9,
    players: game.players.map((player, seat) => ({
      ...player,
      score: seat ? 18 : -9,
    })),
    history: Array.from({ length: 9 }, () => [-1, 2]),
  };
  recordResult(completed, account.id);
  recordResult(completed, "another-golfer");
  const user = userEvent.setup();
  open("/user");
  await user.click(
    await screen.findByRole("button", { name: "Delete Account", exact: true })
  );
  await user.click(screen.getByRole("button", { name: "Yes", exact: true }));
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "delete-password"
  );
  await user.click(screen.getByRole("button", { name: "Delete", exact: true }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Account deleted."
  );
  expect(current).toBeNull();
  expect(readResults(account.id)).toEqual([]);
  expect(readResults("another-golfer")).toHaveLength(1);
  expect(mutations).toEqual([{ path: "/delete", csrf: "csrf-2" }]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(JSON.stringify(localStorage)).not.toContain("delete-password");
});
const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Providers>
        <App />
      </Providers>
    </MemoryRouter>
  );

it("navigates home, setup menus, and rules without creating a game", async () => {
  const user = userEvent.setup();
  open("/");
  await user.click(screen.getByRole("link", { name: "Play", exact: true }));
  await user.click(screen.getByRole("link", { name: /Create Game/ }));
  await user.click(screen.getByRole("button", { name: "6 Players" }));
  expect(screen.getByRole("button", { name: "6 Players" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(
    screen.getByRole("button", { name: "Create Game", exact: true })
  ).toBeEnabled();
  await user.click(screen.getByRole("link", { name: "Back" }));
  await user.click(screen.getByRole("link", { name: /Create Game/ }));
  expect(screen.getByRole("button", { name: "6 Players" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await user.click(screen.getByRole("button", { name: "5 Players" }));
  expect(screen.getByRole("button", { name: "5 Players" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await user.click(screen.getByRole("link", { name: "Back" }));
  await user.click(screen.getByRole("link", { name: /Join Game/ }));
  expect(
    screen.getByRole("button", { name: "Join Game", exact: true })
  ).toBeDisabled();
  expect(
    fetcher.mock.calls.every(
      ([url]) =>
        String(url).includes("/api/account/session") ||
        url === "/api/golf/active"
    )
  ).toBe(true);
});

it("uses a fresh shared session for login/logout and keeps credentials out of storage", async () => {
  const user = userEvent.setup();
  open("/user");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Sign In", exact: true })
    ).toBeEnabled()
  );
  await user.type(screen.getByLabelText("Username or Email"), "Golfer");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "test-password"
  );
  await user.click(
    screen.getByRole("button", { name: "Sign In", exact: true })
  );
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Golfer" })).toBeVisible()
  );
  expect(screen.getByRole("link", { name: "Your account" })).toBeVisible();
  expect(mutations).toEqual([{ path: "/login", csrf: "csrf-2" }]);
  await user.click(screen.getByRole("button", { name: "Sign Out" }));
  expect(await screen.findByLabelText("Password", { exact: true })).toHaveValue(
    ""
  );
  expect(mutations[1]).toEqual({ path: "/logout", csrf: "csrf-3" });
  expect(localStorage.getItem("golf.password")).toBeNull();
  expect(JSON.stringify(localStorage)).not.toContain("test-password");
});

it("validates missing credentials, focuses the field, and clears its error on edit", async () => {
  const user = userEvent.setup();
  open("/user");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Sign In", exact: true })
    ).toBeEnabled()
  );
  const username = screen.getByLabelText("Username or Email");
  const password = screen.getByLabelText("Password", { exact: true });
  await user.type(username, "   ");
  await user.click(
    screen.getByRole("button", { name: "Sign In", exact: true })
  );
  expect(username).toHaveFocus();
  expect(username).toHaveAttribute("aria-invalid", "true");
  expect(username).toHaveAccessibleDescription(
    "Please enter your username or email."
  );
  expect(mutations).toEqual([]);

  await user.type(username, "Golfer");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Sign In", exact: true })
  );
  expect(password).toHaveFocus();
  expect(password).toHaveAccessibleDescription("Please enter your password.");
  expect(mutations).toEqual([]);
  await user.type(password, "test-password");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("shows rejected credentials, preserves them for retry, and offers shared account links", async () => {
  const user = userEvent.setup();
  failLogin = true;
  open("/user");
  await waitFor(() =>
    expect(screen.getByLabelText("Username or Email")).toBeEnabled()
  );
  await user.type(screen.getByLabelText("Username or Email"), "Golfer");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "wrong-password"
  );
  await user.click(
    screen.getByRole("button", { name: "Sign In", exact: true })
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check your username and password."
  );
  expect(screen.getByLabelText("Username or Email")).toHaveValue("Golfer");
  expect(screen.getByLabelText("Password", { exact: true })).toHaveValue(
    "wrong-password"
  );
  expect(
    screen.getByRole("link", { name: "Create an Account" })
  ).toHaveAttribute("href", "http://localhost:3000/user/?view=register");
  expect(
    screen.getByRole("link", { name: "Forgot Password?" })
  ).toHaveAttribute("href", "http://localhost:3000/user/?view=recover");
  failLogin = false;
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Golfer" })).toBeVisible()
  );
  await user.click(screen.getByRole("button", { name: "Sign Out" }));
  expect(await screen.findByLabelText("Username or Email")).toHaveValue("");
  expect(screen.getByLabelText("Password", { exact: true })).toHaveValue("");
});

it("picks up sign-ins and sign-outs from a sister site on focus", async () => {
  open("/user");
  await waitFor(() =>
    expect(screen.getByLabelText("Username or Email")).toBeEnabled()
  );
  current = account;
  fireEvent(window, new Event("focus"));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Golfer" })).toBeVisible()
  );
  current = null;
  fireEvent(window, new Event("focus"));
  await waitFor(() =>
    expect(screen.getByLabelText("Username or Email")).toBeVisible()
  );
});

it("opens the account dashboard and gear menu with separate Profile and Options pages", async () => {
  current = account;
  const user = userEvent.setup();
  open("/play");
  const accountLink = await screen.findByRole("link", {
    name: "Your account",
    exact: true,
  });
  expect(accountLink).toHaveAttribute("href", "/user");
  expect(
    screen.queryByRole("button", { name: "Settings menu" })
  ).not.toBeInTheDocument();
  await user.click(accountLink);
  const gear = screen.getByRole("button", { name: "Settings menu" });
  await user.click(gear);
  expect(gear).toHaveAttribute("aria-expanded", "true");
  expect(
    screen.getByRole("link", { name: "Profile", exact: true })
  ).toHaveAttribute("href", "/profile");
  await user.keyboard("{Escape}");
  expect(gear).toHaveFocus();
  expect(gear).toHaveAttribute("aria-expanded", "false");
  expect(
    await screen.findByRole("heading", { name: "Game Statistics" })
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "Achievements" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Settings menu" }));
  await user.click(screen.getByRole("link", { name: "Profile", exact: true }));
  expect(
    await screen.findByRole("heading", { name: "PROFILE", exact: true })
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Toggle icon picker" })
  ).toBeVisible();
  expect(screen.getByLabelText("Email address")).toBeVisible();
  expect(screen.queryByLabelText("Your statistics")).not.toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Back", exact: true }));
  await user.click(screen.getByRole("button", { name: "Settings menu" }));
  await user.click(screen.getByRole("link", { name: "Options", exact: true }));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "OPTIONS", exact: true })
    ).toBeVisible()
  );
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});

it("saves the Golf opt-in on the account and restores it when revisiting Options", async () => {
  current = {
    ...account,
    turn_sound: { golf: false, euchre: false, hearts: false },
  };
  const user = userEvent.setup();
  const page = open("/options");
  await user.click(await screen.findByRole("checkbox"));
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
  expect(current?.turn_sound).toEqual({
    golf: true,
    euchre: false,
    hearts: false,
  });
  page.unmount();
  open("/options");
  expect(await screen.findByRole("checkbox")).toBeChecked();
});

it("shows real scores and earned badges, saves profile edits, and keeps another account's results private", async () => {
  savedGames = 1;
  const game = createGame(2);
  recordResult(
    {
      ...game,
      phase: "game-over",
      hole: 9,
      players: game.players.map((player, seat) => ({
        ...player,
        score: seat ? 18 : -9,
      })),
      history: Array.from({ length: 9 }, () => [-1, 2]),
    },
    account.id
  );
  current = account;
  const user = userEvent.setup();
  open("/user");
  const stats = await screen.findByLabelText("Your statistics");
  expect(
    within(stats).getByText("Games Played").nextElementSibling
  ).toHaveTextContent("1");
  expect(
    within(stats).getByText("Best Score").nextElementSibling
  ).toHaveTextContent("-9");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Newcomer: Unlocked" })
    ).toBeVisible()
  );
  expect(
    screen.getByRole("button", { name: "Under Par: Unlocked" })
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Full House: Locked" })
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Settings menu" }));
  await user.click(screen.getByRole("link", { name: "Profile", exact: true }));
  await user.click(
    await screen.findByRole("button", { name: "Toggle icon picker" })
  );
  await user.click(screen.getByRole("button", { name: "Cat", exact: true }));
  expect(await screen.findByText("Profile saved.")).toBeVisible();
  expect(current?.profile_icon).toBe("cat");
  expect(mutations[0]).toEqual({ path: "/profile", csrf: "csrf-2" });
  current = { ...account, id: "another-golfer", name: "Another Golfer" };
  fireEvent(window, new Event("focus"));
  await screen.findByRole("heading", { name: "Profile Icon" });
  await user.click(screen.getByRole("link", { name: "Back", exact: true }));
  await screen.findByRole("heading", { name: "Another Golfer" });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Newcomer: Locked" })
    ).toBeVisible()
  );
  await user.click(screen.getByRole("button", { name: "Settings menu" }));
  await user.click(screen.getByRole("link", { name: "Profile", exact: true }));
  expect(
    await screen.findByRole("button", { name: "Toggle icon picker" })
  ).toHaveAttribute("aria-expanded", "false");
});

it("explains the six-card grid, special scores, and the end of a deal", async () => {
  const user = userEvent.setup();
  open("/rules");
  expect(screen.getByText(/Two to six players/)).toHaveTextContent(
    "two standard 52-card decks (104 cards total)"
  );
  expect(screen.getByText(/Trade high cards/)).toHaveTextContent(
    "paired twos, which score −4"
  );
  expect(screen.getByText(/Trade high cards/)).toHaveTextContent(
    "four twos, which score −28"
  );
  await user.click(screen.getByRole("button", { name: "The Deal" }));
  expect(screen.getAllByRole("img")).toHaveLength(6);
  await waitFor(() => expect(screen.getByText(/don’t peek/)).toBeVisible());
  expect(screen.getByText(/don’t peek/)).toHaveTextContent(
    "one top card and one bottom card"
  );
  expect(screen.getByText(/don’t peek/)).toHaveTextContent(
    "not in the same column"
  );
  await user.click(screen.getByRole("button", { name: "Your Turn" }));
  expect(screen.getByText(/go out and start the final round/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Going Out" }));
  expect(screen.getByText(/you’re declaring/)).toHaveTextContent(
    "lowest score"
  );
  expect(screen.getByText(/rest of the table/)).toHaveTextContent(
    "one more turn"
  );
  expect(screen.getByText(/10 penalty/)).toHaveTextContent(
    "only once, after everyone’s final turn"
  );
  expect(screen.getByText(/10 penalty/)).toHaveTextContent(
    "A tied lowest score has no penalty"
  );
  await user.click(screen.getByRole("button", { name: "Scoring" }));
  expect(screen.getByText("−2")).toBeVisible();
  expect(screen.getByText(/A matching vertical pair/)).toHaveTextContent(
    "paired twos, which score −4"
  );
  expect(screen.getByText(/Four cards of the same rank/)).toHaveTextContent(
    "Score the remaining two cards normally."
  );
  expect(screen.getByText(/Four cards of the same rank/)).toHaveTextContent(
    "Four twos score −28"
  );
  expect(screen.getByText("−20 points")).toBeVisible();
  expect(screen.getByText(/Grid total:/)).toHaveTextContent("−17 points");
  expect(screen.getAllByRole("img", { name: /^8 of/ })).toHaveLength(4);
});
