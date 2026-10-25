import { expect, it, vi } from "vitest";
import { golfPost } from "./golfApi";

it("sends the player's local UTC offset with game creation and lobby joins", async () => {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(420);
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(
    url.endsWith("/session") ? { csrf_token: "fresh-csrf" } : { state: {} },
  )));
  vi.stubGlobal("fetch", fetcher);
  await golfPost("/lobbies/join", { code: "ABC234" });
  const [url, init] = (fetcher.mock.calls as unknown as [string, RequestInit][])[1];
  expect(url).toBe("/api/golf/lobbies/join");
  expect(new Headers(init.headers).get("X-Golf-UTC-Offset")).toBe("420");
  expect(new Headers(init.headers).get("X-Golf-CSRF")).toBe("fresh-csrf");
});
