import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AchievementBadge } from "./AchievementBadge";
import { computeAchievements } from "@/lib/achievements";

it("conceals a secret's name, icon and requirement until it is earned, including in its tooltip", () => {
  const badge = computeAchievements().find(badge => badge.id === "new_year")!;
  const onOpenChange = vi.fn();
  const { rerender } = render(<AchievementBadge badge={badge} open onOpenChange={onOpenChange} />);
  const button = screen.getByRole("button", { name: "Secret achievement: Locked" });
  expect(button.querySelector('svg[data-icon="question"]')).toBeInTheDocument();
  expect(screen.queryByText(badge.name)).not.toBeInTheDocument();
  expect(screen.queryByText(badge.desc)).not.toBeInTheDocument();
  expect(screen.getByRole("tooltip")).toHaveTextContent("????This is a secret achievement");

  rerender(<AchievementBadge badge={{ ...badge, earned: true }} open onOpenChange={onOpenChange} />);
  const earned = screen.getByRole("button", { name: "Auld Lang Syne: Unlocked" });
  expect(earned.querySelector(`svg[data-icon="${badge.icon.iconName}"]`)).toBeInTheDocument();
  expect(screen.getByRole("tooltip")).toHaveTextContent(badge.desc);
  expect(screen.queryByText("This is a secret achievement")).not.toBeInTheDocument();
});
