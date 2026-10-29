import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { SoundProvider } from "@/context/SoundContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { statisticsFixture } from "@/test/golfFixtures";
import { Navbar } from "./Navbar";
import { AccountSummary } from "./AccountSummary";

const identity = vi.hoisted(() => ({ user: { id: "1", name: "Golfer" } as { id: string; name: string } | null }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: identity.user }) }));

beforeEach(() => { identity.user = { id: "1", name: "Golfer" }; });

function setup({ music = true, profile = false, sessionUserId = "1", fail = false } = {}) {
  localStorage.setItem("golf.music.v1", JSON.stringify(music));
  let saved = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/session")) return new Response(JSON.stringify({ csrf_token: "fresh-csrf", user: { id: sessionUserId } }));
    if (url.endsWith("/achievements")) {
      if (fail) return new Response(JSON.stringify({ error: "Please retry." }), { status: 503 });
      saved = true;
      return new Response(JSON.stringify({ unlocks: ["geezer"] }));
    }
    const statistics = statisticsFixture();
    statistics.all_time.achievements.geezer = saved;
    return new Response(JSON.stringify({ statistics }));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter><ThemeProvider><SoundProvider>
    <Navbar />{profile && <AccountSummary userId="1" />}
  </SoundProvider></ThemeProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Sound and music settings" }));
  return fetcher;
}

it("saves Geezer when music is turned off and immediately refreshes the account badge", async () => {
  const fetcher = setup({ profile: true });
  await screen.findByLabelText("Your statistics");
  expect(screen.queryByText("Geezer")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Secret achievement: Locked" })).toHaveLength(17);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/achievements"))).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Toggle music" }));
  expect(await screen.findByRole("button", { name: "Geezer: Unlocked" })).toBeVisible();
  const calls = fetcher.mock.calls.filter(([url]) => url.endsWith("/achievements"));
  expect(calls).toHaveLength(1);
  const init = calls[0][1]!;
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toEqual({ id: "geezer" });
  expect(new Headers(init.headers).get("X-Golf-CSRF")).toBe("fresh-csrf");
});

it("also saves Geezer when the music slider is moved to zero", async () => {
  const fetcher = setup();
  fireEvent.change(screen.getByRole("slider", { name: "Music volume" }), { target: { value: "0" } });
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/achievements"))).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Toggle music" })).toHaveAttribute("aria-pressed", "false");
});

it("does not award Geezer for the initial music setting, enabling music, or muting effects", () => {
  const fetcher = setup({ music: false });
  fireEvent.click(screen.getByRole("button", { name: "Toggle sound effects" }));
  fireEvent.click(screen.getByRole("button", { name: "Toggle music" }));
  expect(fetcher).not.toHaveBeenCalled();
});

it("keeps guest music controls local", () => {
  identity.user = null;
  const fetcher = setup();
  fireEvent.click(screen.getByRole("button", { name: "Toggle music" }));
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not credit a different account after the shared session changes", async () => {
  const fetcher = setup({ sessionUserId: "2" });
  fireEvent.click(screen.getByRole("button", { name: "Toggle music" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0][0]).toBe("/api/golf/session");
  expect(screen.getByRole("button", { name: "Toggle music" })).toHaveAttribute("aria-pressed", "false");
});

it("keeps music controls working without showing an unlock when saving fails", async () => {
  const fetcher = setup({ profile: true, fail: true });
  await screen.findByLabelText("Your statistics");
  fireEvent.click(screen.getByRole("button", { name: "Toggle music" }));
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/achievements"))).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Toggle music" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByText("Geezer")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Secret achievement: Locked" })).toHaveLength(17);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/stats"))).toHaveLength(1);
});
