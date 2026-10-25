import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Providers } from "@/App";
import { SELECTION_STYLES } from "@/game/selectionStyles";
import CardStyles from "./CardStyles";

it("shows all five real selection styles simultaneously in both themes, with valid and idle examples", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: null, csrf_token: "test" }))));
  render(<MemoryRouter><Providers><CardStyles /></Providers></MemoryRouter>);
  for (const theme of ["light", "dark"]) {
    const section = screen.getByRole("region", { name: `${theme} mode examples` });
    expect(within(section).getAllByRole("article")).toHaveLength(5);
    expect(within(section).getAllByRole("button").filter(button => button.matches(":enabled"))).toHaveLength(10);
    expect(within(section).getAllByRole("button").filter(button => button.matches(":disabled"))).toHaveLength(5);
    expect(within(section).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(
      SELECTION_STYLES.map(style => `/game/single?players=6&selection=${style.id}`)
    );
  }
});
