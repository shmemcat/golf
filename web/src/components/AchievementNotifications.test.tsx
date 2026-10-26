import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AchievementNotifications } from "./AchievementNotifications";
import { ACHIEVEMENT_EVENT } from "@/lib/achievements";
import { statisticsFixture } from "@/test/golfFixtures";

const state = vi.hoisted(() => ({ user: { id: "alice" } as { id: string } | null }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));

const key = (id = "alice") => `golf.achievements-seen.v1:${id}`;
let statistics = statisticsFixture();
let fetcher: ReturnType<typeof vi.fn>;
const response = () => new Response(JSON.stringify({ statistics }));
const refresh = async (event = "golf:results") => {
  await act(async () => { window.dispatchEvent(new Event(event)); });
};
const seed = async () => {
  const view = render(<AchievementNotifications />);
  await waitFor(() => expect(localStorage.getItem(key())).not.toBeNull());
  return view;
};

beforeEach(() => {
  state.user = { id: "alice" };
  statistics = statisticsFixture();
  fetcher = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetcher);
});

it("seeds historical achievements quietly and batches new game achievements with their icons", async () => {
  statistics = statisticsFixture(1);
  await seed();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  statistics.all_time.achievements = { ...statistics.all_time.achievements,
    birdie: true, eagle: true, hole_in_one: true, six_of_a_kind: true };
  await refresh();
  const notice = screen.getByRole("status");
  expect(notice).toHaveTextContent("Birdie");
  expect(notice).toHaveTextContent("Eagle");
  expect(notice).toHaveTextContent("Hole in One");
  expect(notice).toHaveTextContent("+1 more");
  expect(within(notice).getAllByText("Achievement Unlocked!")).toHaveLength(3);
  expect(notice.querySelectorAll("svg")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss Birdie achievement notification" }));
  expect(notice).toHaveTextContent("Six of a Kind");
  expect(notice).not.toHaveTextContent("+1 more");
});

it.each(["golf:results", ACHIEVEMENT_EVENT, "focus", "online"])("checks new achievements on %s", async event => {
  await seed();
  statistics.all_time.achievements.geezer = true;
  await refresh(event);
  expect(screen.getByRole("status")).toHaveTextContent("Geezer");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/golf/stats", "/api/golf/stats"]);
});

it("persists announcements across duplicate events and remounts", async () => {
  const view = render(<AchievementNotifications />);
  await waitFor(() => expect(localStorage.getItem(key())).toBe("[]"));
  statistics.all_time.achievements.geezer = true;
  await refresh();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss Geezer achievement notification" }));
  await refresh(ACHIEVEMENT_EVENT);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(key())!)).toContain("geezer");
  view.unmount();
  await seed();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("announces tier upgrades once and remembers lower tiers", async () => {
  statistics = statisticsFixture(10);
  await seed();
  statistics = statisticsFixture(50);
  await refresh();
  expect(screen.getByRole("status")).toHaveTextContent("Green Jacket");
  expect(screen.getByRole("status").querySelector("svg")).toHaveAttribute("data-tier", "silver");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss Green Jacket achievement notification" }));
  statistics = statisticsFixture(10);
  await refresh();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  statistics = statisticsFixture(50);
  await refresh();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  statistics = statisticsFixture(100);
  await refresh();
  expect(screen.getByRole("status")).toHaveTextContent("Tour Pro");
  expect(JSON.parse(localStorage.getItem(key())!)).toEqual(expect.arrayContaining([
    "golf_regular_bronze", "golf_regular_silver", "golf_regular_gold",
  ]));
});

it("hides a previous account's notice and ignores its delayed responses", async () => {
  const view = render(<AchievementNotifications />);
  await waitFor(() => expect(localStorage.getItem(key())).toBe("[]"));
  statistics.all_time.achievements.geezer = true;
  await refresh();
  expect(screen.getByRole("status")).toHaveTextContent("Geezer");
  let resolve!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  await refresh();
  const oldResponse = response();
  state.user = { id: "bob" };
  statistics = statisticsFixture();
  view.rerender(<AchievementNotifications />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await waitFor(() => expect(localStorage.getItem(key("bob"))).toBe("[]"));
  await act(async () => resolve(oldResponse));
  expect(localStorage.getItem(key("bob"))).toBe("[]");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("ignores stale refreshes and retries after a failed request", async () => {
  await seed();
  let resolve!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  await refresh();
  const stale = response();
  statistics.all_time.achievements.geezer = true;
  await refresh();
  await act(async () => resolve(stale));
  expect(screen.getByRole("status")).toHaveTextContent("Geezer");
  expect(JSON.parse(localStorage.getItem(key())!)).toContain("geezer");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss Geezer achievement notification" }));
  fetcher.mockRejectedValueOnce(new TypeError("Offline"));
  statistics.all_time.achievements.first_game = true;
  await refresh();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await refresh("online");
  expect(screen.getByRole("status")).toHaveTextContent("Newcomer");
});

it("keeps duplicate protection working when browser storage is blocked", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  render(<AchievementNotifications />);
  await act(async () => {});
  statistics.all_time.achievements.geezer = true;
  await refresh();
  expect(screen.getByRole("status")).toHaveTextContent("Geezer");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss Geezer achievement notification" }));
  await refresh();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("dismisses automatically and cleans up on sign-out", async () => {
  const view = await seed();
  vi.useFakeTimers();
  try {
    statistics.all_time.achievements.geezer = true;
    await refresh();
    expect(screen.getByRole("status")).toHaveTextContent("Geezer");
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByRole("status")).toHaveTextContent("Geezer");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    statistics.all_time.achievements.first_game = true;
    await refresh();
    expect(screen.getByRole("status")).toHaveTextContent("Newcomer");
    state.user = null;
    view.rerender(<AchievementNotifications />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const requests = fetcher.mock.calls.length;
    await refresh();
    expect(fetcher).toHaveBeenCalledTimes(requests);
  } finally { vi.useRealTimers(); }
});

it("does not request account achievements for guests", () => {
  state.user = null;
  render(<AchievementNotifications />);
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
