import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useInactivityNudge } from "./useInactivityNudge";

const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("@/context/SoundContext", () => ({ useSound: () => sound }));
afterEach(() => { vi.useRealTimers(); sound.play.mockClear(); });

it("nudges once after 15 actionable seconds and ends the shake after 2 seconds", () => {
   vi.useFakeTimers();
   const view = renderHook(({ active }) => useInactivityNudge(active, "turn-1"), { initialProps: { active: false } });
   act(() => vi.advanceTimersByTime(60_000));
   expect(sound.play).not.toHaveBeenCalled();
   view.rerender({ active: true });
   act(() => vi.advanceTimersByTime(14_999));
   expect(sound.play).not.toHaveBeenCalled();
   act(() => vi.advanceTimersByTime(1));
   expect(sound.play).toHaveBeenCalledExactlyOnceWith("notification");
   expect(view.result.current.shaking).toBe(true);
   act(() => vi.advanceTimersByTime(2000));
   expect(view.result.current.shaking).toBe(false);
   act(() => vi.advanceTimersByTime(60_000));
   expect(sound.play).toHaveBeenCalledOnce();
});

it("resets on interaction or a new decision and cancels when input becomes unavailable", () => {
   vi.useFakeTimers();
   const view = renderHook(({ active, decision }) => useInactivityNudge(active, decision), { initialProps: { active: true, decision: "turn-1" } });
   act(() => vi.advanceTimersByTime(14_000));
   act(() => view.result.current.reset());
   act(() => vi.advanceTimersByTime(14_000));
   expect(sound.play).not.toHaveBeenCalled();
   view.rerender({ active: true, decision: "turn-2" });
   act(() => vi.advanceTimersByTime(14_000));
   view.rerender({ active: false, decision: "turn-2" });
   act(() => vi.advanceTimersByTime(60_000));
   expect(sound.play).not.toHaveBeenCalled();
   view.rerender({ active: true, decision: "turn-3" });
   act(() => vi.advanceTimersByTime(15_000));
   expect(sound.play).toHaveBeenCalledExactlyOnceWith("notification");
   view.rerender({ active: false, decision: "turn-3" });
   expect(view.result.current.shaking).toBe(false);
});
