import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { AccountUser, ProfileUpdate } from "@/lib/account";
import { CardBackProvider } from "@/context/CardBackContext";
import { CARD_BACK_STORAGE_KEY } from "@/lib/cardBacks";
import { Card } from "./Card";
import { CardBackOption } from "./CardBackOption";
import { FlipCard } from "./game/FlipCard";

const auth = vi.hoisted(() => ({ user: null as AccountUser | null, loading: false, updateProfile: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
beforeEach(() => {
  auth.user = { id: "first", name: "First", card_backs: { golf: "argyle" } };
  auth.loading = false;
  auth.updateProfile.mockReset().mockImplementation(async (data: ProfileUpdate) => {
    auth.user = { ...auth.user!, card_backs: { golf: data.card_back!.design } };
    return { user: auth.user, csrf_token: "test" };
  });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) },
    close: { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) },
  });
});

function Example() {
  return <CardBackProvider>
    <CardBackOption />
    <section aria-label="Table cards"><Card /><FlipCard card={{ rank: "Q", suit: "H" }} faceUp={false} /><Card rank="Q" suit="H" /></section>
  </CardBackProvider>;
}
const open = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Change design" }));
  return screen.getByRole("dialog", { name: "Choose a Card Back" });
};

it("shows only the heading, all 28 approved backs, and Close; uses a primary Change design button", async () => {
  localStorage.setItem("golf.card-back-concepts.shortlist.v1", "[]");
  render(<Example />);
  const button = screen.getByRole("button", { name: "Change design" });
  expect(button.className).not.toContain("button-secondary");
  expect(screen.queryByText(/Choose a design for your cards/)).not.toBeInTheDocument();
  const dialog = await open();
  expect(within(dialog).getAllByRole("radio")).toHaveLength(28);
  expect(within(dialog).queryByRole("searchbox")).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText("Card-back categories")).not.toBeInTheDocument();
  expect(within(dialog).getAllByRole("button")).toHaveLength(1);
  expect(within(dialog).getByRole("radio", { name: "Argyle", exact: true })).toHaveFocus();
  await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(button).toHaveFocus();
});

it("automatically saves selections to the profile, updates table cards, keeps the popup open, and restores on remount", async () => {
  const first = render(<Example />);
  const dialog = await open();
  await userEvent.click(within(dialog).getByRole("radio", { name: "Ginkgo", exact: true }));
  await waitFor(() => expect(auth.updateProfile).toHaveBeenCalledExactlyOnceWith({ card_back: { game: "golf", design: "ginkgo" } }));
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByRole("radio", { name: "Ginkgo", exact: true })).toBeChecked();
  expect(localStorage.getItem(CARD_BACK_STORAGE_KEY)).toBeNull();
  const table = screen.getByRole("region", { name: "Table cards" });
  for (const back of table.querySelectorAll(".card-back")) {
    expect(back).toHaveAttribute("data-card-back", "ginkgo");
    expect(back.querySelector("img")).toHaveAttribute("src", "/cards/backs/ginkgo-light.svg");
    expect(back.querySelector(".card-back-dark")).toHaveAttribute("src", "/cards/backs/ginkgo-dark.svg");
  }
  expect(within(table).getByRole("img", { name: "Queen of hearts" })).toBeInTheDocument();
  expect(within(dialog).getByRole("radio", { name: "Compass", exact: true }).closest("label")!.querySelector(".card-back")).toHaveAttribute("data-card-back", "compass");
  await userEvent.click(within(dialog).getByRole("radio", { name: "Heritage gingham", exact: true }));
  await waitFor(() => expect(auth.user?.card_backs?.golf).toBe("heritage-gingham"));
  first.unmount();
  render(<Example />);
  expect(screen.getByRole("heading", { name: "Heritage gingham" })).toBeInTheDocument();
});

it("reverts a failed save, shows the error, and allows retry", async () => {
  auth.updateProfile.mockRejectedValueOnce(new Error("Unable to save. Please try again."));
  render(<Example />);
  const dialog = await open();
  await userEvent.click(within(dialog).getByRole("radio", { name: "North star", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save");
  expect(within(dialog).getByRole("radio", { name: "Argyle", exact: true })).toBeChecked();
  await userEvent.click(within(dialog).getByRole("radio", { name: "North star", exact: true }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(auth.user?.card_backs?.golf).toBe("north-star");
});

it("ignores device preferences and immediately isolates guests and different accounts", async () => {
  localStorage.setItem(CARD_BACK_STORAGE_KEY, JSON.stringify("north-star"));
  auth.user = { id: "first", name: "First", card_backs: { golf: "ginkgo" } };
  const page = render(<Example />);
  expect(screen.getByRole("heading", { name: "Ginkgo" })).toBeInTheDocument();
  auth.user = { id: "second", name: "Second", card_backs: { golf: "fern-sprig" } };
  page.rerender(<Example />);
  expect(screen.getByRole("heading", { name: "Fern sprig" })).toBeInTheDocument();
  auth.user = null;
  page.rerender(<Example />);
  expect(screen.getByRole("heading", { name: "Argyle" })).toBeInTheDocument();
  const dialog = await open();
  for (const radio of within(dialog).getAllByRole("radio")) expect(radio).toBeDisabled();
  expect(auth.updateProfile).not.toHaveBeenCalled();
});

it("blocks overlapping saves and ignores a previous account's pending completion", async () => {
  let resolve!: (value: unknown) => void;
  auth.updateProfile.mockImplementation(() => new Promise(done => { resolve = done; }));
  const page = render(<Example />);
  const dialog = await open();
  await userEvent.click(within(dialog).getByRole("radio", { name: "Ginkgo", exact: true }));
  expect(within(dialog).getByRole("radio", { name: "Compass", exact: true })).toBeDisabled();
  auth.user = { id: "second", name: "Second", card_backs: { golf: "fern-sprig" } };
  page.rerender(<Example />);
  await act(async () => resolve({ user: { id: "first", name: "First", card_backs: { golf: "ginkgo" } }, csrf_token: "test" }));
  expect(screen.getByRole("heading", { name: "Fern sprig" })).toBeInTheDocument();
  expect(within(dialog).getByRole("radio", { name: "Fern sprig", exact: true })).toBeChecked();
});

it("closes on outside click and Escape without saving", async () => {
  render(<Example />);
  fireEvent.click(await open());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent(await open(), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(auth.updateProfile).not.toHaveBeenCalled();
});
