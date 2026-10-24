import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App, Providers } from "./App";
import { vi, expect, it, beforeEach } from "vitest";
const account = {
  id: "shared-id",
  name: "Golfer",
  email: "golfer@example.test",
  profile_icon: "user",
  email_verified: true,
};
let current: typeof account | null;
let failLogin: boolean;
let mutations: { path: string; csrf: string | null }[];
let sessionNumber: number;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  current = null;
  failLogin = false;
  mutations = [];
  sessionNumber = 0;
  fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
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
    }
    return new Response(
      JSON.stringify({ user: current, csrf_token: `csrf-${sessionNumber}` })
    );
  });
  vi.stubGlobal("fetch", fetcher);
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
  await user.click(screen.getByRole("button", { name: "4 Players" }));
  expect(screen.getByRole("button", { name: "4 Players" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  expect(
    screen.getByRole("button", { name: "Create Game", exact: true })
  ).toBeDisabled();
  await user.click(screen.getByRole("link", { name: "Back" }));
  await user.click(screen.getByRole("link", { name: /Join Game/ }));
  expect(
    screen.getByRole("button", { name: "Join Game", exact: true })
  ).toBeDisabled();
  expect(
    fetcher.mock.calls.every(([url]) =>
      String(url).includes("/api/account/session")
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
  expect(await screen.findByRole("heading", { name: "Golfer" })).toBeVisible();
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

it("shows rejected credentials and offers the shared recovery and registration pages", async () => {
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
  expect(screen.getByLabelText("Password", { exact: true })).toHaveValue("");
  expect(
    screen.getByRole("link", { name: "Create an Account" })
  ).toHaveAttribute("href", "http://localhost:3000/user/?view=register");
  expect(
    screen.getByRole("link", { name: "Forgot Password?" })
  ).toHaveAttribute("href", "http://localhost:3000/user/?view=recover");
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
  expect(await screen.findByLabelText("Username or Email")).toBeVisible();
});

it("explains the six-card grid, special scores, and the end of a deal", async () => {
  const user = userEvent.setup();
  open("/rules");
  await user.click(screen.getByRole("button", { name: "The Deal" }));
  expect(screen.getAllByRole("img")).toHaveLength(6);
  expect(screen.getByText(/don’t peek/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Your Turn" }));
  expect(screen.getByText(/deal ends when/)).toHaveTextContent(
    "six face-up cards"
  );
  await user.click(screen.getByRole("button", { name: "Scoring" }));
  expect(screen.getByText("−2")).toBeVisible();
  expect(screen.getByText(/even two twos/)).toBeVisible();
});
