import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi, expect, it } from "vitest";
import { AccountSummary } from "./AccountSummary";
import { statisticsFixture } from "@/test/golfFixtures";

it.each([
  [0, "Tee Time", undefined, "0 / 10 games finished", "Tee Time"],
  [9, "Tee Time", undefined, "9 / 10 games finished", "Tee Time"],
  [10, "Tee Time", "bronze", "10 / 50 games finished", "Green Jacket"],
  [49, "Tee Time", "bronze", "49 / 50 games finished", "Green Jacket"],
  [50, "Green Jacket", "silver", "50 / 100 games finished", "Tour Pro"],
  [99, "Green Jacket", "silver", "99 / 100 games finished", "Tour Pro"],
  [100, "Tour Pro", "gold", "100 games finished · Gold achieved", null],
])("shows the correct medal and next milestone after %i finished games", async (games, name, tier, progress, next) => {
  const statistics = statisticsFixture(games);
  // Abandoned games do not advance the completion ladder.
  statistics.all_time.games_played += 100;
  statistics.all_time.games_abandoned = 100;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ statistics }))));
  render(<AccountSummary userId="golfer" />);
  await screen.findByLabelText("Your statistics");
  const label = `${name}: ${tier ? `${tier[0].toUpperCase() + tier.slice(1)}, Unlocked` : "Locked"}`;
  const badge = screen.getByRole("button", { name: label });
  if (tier) expect(badge).toHaveAttribute("data-tier", tier);
  else expect(badge).not.toHaveAttribute("data-tier");
  fireEvent.click(badge);
  const tooltip = await screen.findByRole("tooltip");
  expect(within(tooltip).getByText(progress)).toBeVisible();
  if (next) expect(tooltip).toHaveTextContent(`Next: ${next}`);
  else expect(tooltip).not.toHaveTextContent("Next:");
});

it("keeps existing achievements and shows all new Golf and holiday badges from account results", async () => {
  const statistics = statisticsFixture(1);
  statistics.all_time.achievements = { ...statistics.all_time.achievements, birdie: true, spooky: true,
    geezer: true, night_owl: true, better_with_friends: true };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ statistics }))));
  render(<AccountSummary userId="golfer" />);
  await screen.findByLabelText("Your statistics");
  const achievements = screen.getByRole("region", { name: "Achievements" });
  expect(within(achievements).getAllByRole("button")).toHaveLength(33);
  expect(screen.getByRole("button", { name: "Below Zero: Unlocked" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Under Par: Unlocked" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Birdie: Unlocked" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Spooky: Unlocked" })).toBeVisible();
  for (const name of ["Geezer", "Night Owl", "Better with Friends"]) {
    expect(screen.getByRole("button", { name: `${name}: Unlocked` })).toBeVisible();
  }
  for (const name of ["Eagle", "Hole in One", "Six of a Kind", "Deuce Almighty", "Up and Down", "Out of the Rough", "Sunday Best"]) {
    expect(screen.getByRole("button", { name: `${name}: Locked` })).toBeVisible();
  }
  for (const name of ["Full House", "Photo Finish", "Don't Quit Your Day Job",
    "Auld Lang Syne", "Lonely Heart", "Lucky Clover", "Easter Egg", "Fireworks", "Thankful", "Christmas Spirit",
    "Early Bird", "Hot Streak", "All Year Round"]) {
    expect(within(achievements).queryByText(name)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${name}: Locked` })).not.toBeInTheDocument();
  }
  expect(within(achievements).getAllByRole("button", { name: "Secret achievement: Locked" })).toHaveLength(13);
});

it("shows Six of a Kind as earned with its matching-rank requirement", async () => {
  const statistics = statisticsFixture(1);
  statistics.all_time.achievements.six_of_a_kind = true;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ statistics }))));
  render(<AccountSummary userId="golfer" />);
  const badge = await screen.findByRole("button", { name: "Six of a Kind: Unlocked" });
  fireEvent.click(badge);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Finish a hole with all six board cards the same rank.");
});

it("shows Deuce Almighty with a lightning bolt and its matching-twos requirement", async () => {
  const statistics = statisticsFixture(1);
  statistics.all_time.achievements.deuce_almighty = true;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ statistics }))));
  render(<AccountSummary userId="golfer" />);
  const badge = await screen.findByRole("button", { name: "Deuce Almighty: Unlocked" });
  expect(badge.querySelector('svg[data-icon="bolt"]')).toBeInTheDocument();
  fireEvent.click(badge);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Finish a hole with a matching 2×2 block of twos.");
});

it("reveals Don't Quit Your Day Job with a briefcase after scoring the maximum on a hole", async () => {
  const statistics = statisticsFixture(1);
  statistics.all_time.achievements.dont_quit_your_day_job = true;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ statistics }))));
  render(<AccountSummary userId="golfer" />);
  const badge = await screen.findByRole("button", { name: "Don't Quit Your Day Job: Unlocked" });
  expect(badge.querySelector('svg[data-icon="briefcase"]')).toBeInTheDocument();
  fireEvent.click(badge);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Score the maximum amount of points possible on a single hole");
});
