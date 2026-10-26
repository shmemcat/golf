import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Providers } from "@/App";
import CardBackPickerPreview from "./CardBackPickerPreview";
import { SELECTABLE_CARD_BACKS } from "@/lib/cardBacks";
import type { AccountUser } from "@/lib/account";

function mockDialogs() {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
}

function exampleBacks(name: string) {
  return Array.from(screen.getByRole("radio", { name, exact: true }).closest("label")!.querySelectorAll(".card-back"), card => card.getAttribute("data-card-back"));
}

it("shows the selected compact design in the real Options page without layout controls or helper copy", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: null, csrf_token: "test" }))));
  render(<MemoryRouter initialEntries={["/game/card-back-picker"]}><Providers><CardBackPickerPreview /></Providers></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "OPTIONS", exact: true })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Golf home" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Use dark theme" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Play a sound when it’s my turn" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back", exact: true })).toHaveAttribute("href", "/user");
  expect(screen.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
  expect(screen.getByRole("button", { name: "Change design" })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Card-back picker layout" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Preview menu design" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Choose a design for your cards/)).not.toBeInTheDocument();
});

it("updates both illustrations from the preview picker and keeps two distinct random alternatives that exclude the selected back", async () => {
  mockDialogs();
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ user: null, csrf_token: "test" })));
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter initialEntries={["/game/card-back-picker?menu=tiles"]}><Providers><CardBackPickerPreview /></Providers></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Change design" }));
  await userEvent.click(screen.getByRole("radio", { name: "Ginkgo", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
  expect(exampleBacks("One design everywhere")).toEqual(["ginkgo", "ginkgo", "ginkgo"]);
  const individual = exampleBacks("Each player’s design");
  expect(individual[0]).toBe("ginkgo");
  expect(new Set(individual).size).toBe(3);
  for (const id of individual) expect(SELECTABLE_CARD_BACKS.some(back => back.id === id)).toBe(true);
  await userEvent.click(screen.getByText("Each player’s design", { exact: true }));
  expect(exampleBacks("Each player’s design")).toEqual(individual);
  await userEvent.click(screen.getByRole("button", { name: "Change design" }));
  await userEvent.click(screen.getByRole("radio", { name: "North star", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
  expect(exampleBacks("One design everywhere")).toEqual(["north-star", "north-star", "north-star"]);
  const nextIndividual = exampleBacks("Each player’s design");
  expect(nextIndividual[0]).toBe("north-star");
  expect(new Set(nextIndividual).size).toBe(3);
  expect(fetcher.mock.calls.every(call => String(call[0]).endsWith("/session"))).toBe(true);
});

it("uses the profile preference and saves real account changes when the preview is signed in", async () => {
  mockDialogs();
  let account: AccountUser = { id: "test-player", name: "Player", card_backs: { golf: "north-star" } };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/profile")) account = { ...account, card_backs: { golf: JSON.parse(String(init?.body)).card_back.design } };
    return new Response(JSON.stringify({ user: account, csrf_token: "test" }));
  });
  vi.stubGlobal("fetch", fetcher);
  render(<MemoryRouter initialEntries={["/game/card-back-picker?menu=tiles"]}><Providers><CardBackPickerPreview /></Providers></MemoryRouter>);
  await screen.findByRole("heading", { name: "North star", exact: true });
  expect(exampleBacks("One design everywhere")).toEqual(["north-star", "north-star", "north-star"]);
  await userEvent.click(screen.getByRole("button", { name: "Change design" }));
  await userEvent.click(screen.getByRole("radio", { name: "Ginkgo", exact: true }));
  await waitFor(() => expect(account.card_backs?.golf).toBe("ginkgo"));
  await userEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
  expect(exampleBacks("One design everywhere")).toEqual(["ginkgo", "ginkgo", "ginkgo"]);
  expect(exampleBacks("Each player’s design")[0]).toBe("ginkgo");
  const request = fetcher.mock.calls.find(([url]) => url.endsWith("/profile"));
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({ card_back: { game: "golf", design: "ginkgo" } });
});
