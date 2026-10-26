import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Providers } from "@/App";
import CardBackPickerPreview from "./CardBackPickerPreview";

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
  expect(screen.queryByText(/Choose a design for your cards/)).not.toBeInTheDocument();
});
