import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { seatOffset, useTableauNavigation } from "./useTableauNavigation";
import type { PointerEvent } from "react";

it("treats horizontal swipes as navigation, leaving taps and vertical scrolling alone", () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const { result } = renderHook(() => useTableauNavigation(6, 0));
  const event = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, currentTarget: { setPointerCapture: vi.fn() } }) as unknown as PointerEvent<HTMLDivElement>;
  act(() => { result.current.swipe.onPointerDown(event(200, 100)); result.current.swipe.onPointerUp(event(190, 104)); });
  expect(result.current.following).toBe(true);
  act(() => { result.current.swipe.onPointerDown(event(200, 100)); result.current.swipe.onPointerUp(event(150, 260)); });
  expect(result.current.following).toBe(true);
  act(() => {
    result.current.swipe.onPointerDown(event(240, 100));
    result.current.swipe.onPointerMove(event(200, 102));
    result.current.swipe.onPointerUp(event(120, 104));
  });
  expect(result.current.viewedSeat).toBe(1);
  expect(result.current.following).toBe(false);
  act(() => { result.current.swipe.onPointerDown(event(100, 100)); result.current.swipe.onPointerUp(event(230, 105)); });
  expect(result.current.viewedSeat).toBe(0);
});

it("routes the first and last seats through neighboring edges", () => {
  expect(seatOffset(5, 0, 6)).toBe(-1);
  expect(seatOffset(0, 5, 6)).toBe(1);
  expect(seatOffset(3, 0, 6)).toBe(3);
});
