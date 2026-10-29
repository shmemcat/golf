import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { beforeEach, expect, it, vi } from "vitest";
import { golfGet } from "@/lib/golfApi";
import Leaderboard from "./Leaderboard";

vi.mock("@/lib/golfApi", () => ({golfGet: vi.fn()}));
vi.mock("@/components/Navbar", () => ({Navbar: () => null}));
beforeEach(() => vi.mocked(golfGet).mockReset().mockResolvedValue({monthly: [], all_time: []}));

function page() {
  return render(<HelmetProvider><MemoryRouter><Leaderboard /></MemoryRouter></HelmetProvider>);
}

it("switches from wins to all-time achievements and back", async () => {
  page();
  await screen.findAllByText("No winners yet");
  vi.mocked(golfGet).mockResolvedValue({monthly: [], all_time: [
    {rank: 1, username: "Collector", profile_icon: "cat", achievement_count: 18},
    {rank: 2, username: "Starter", profile_icon: "cat", achievement_count: 1},
  ]});
  fireEvent.click(screen.getByRole("button", {name: "Achievements"}));
  expect(await screen.findByText("18 achievements")).toBeInTheDocument();
  expect(screen.getByText("1 achievement")).toBeInTheDocument();
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.queryByText("Monthly")).not.toBeInTheDocument();
  expect(golfGet).toHaveBeenLastCalledWith("/leaderboard?mode=achievements", expect.any(AbortSignal));
  vi.mocked(golfGet).mockResolvedValue({monthly: [], all_time: []});
  fireEvent.click(screen.getByRole("button", {name: "Multiplayer"}));
  await waitFor(() => expect(screen.getAllByRole("table")).toHaveLength(2));
});

it("shows an achievement loading failure and retries", async () => {
  page();
  await screen.findAllByText("No winners yet");
  vi.mocked(golfGet).mockRejectedValueOnce(new Error("Accounts unavailable"));
  fireEvent.click(screen.getByRole("button", {name: "Achievements"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Accounts unavailable");
  fireEvent.click(screen.getByRole("button", {name: "Try again"}));
  expect(await screen.findByText("No achievements yet")).toBeInTheDocument();
});
