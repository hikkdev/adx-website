import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDwellTimer, createEventBatcher, firstSightThisView, markPageView, resetPageViews, type PromotionEvent } from "./promotion-events";

const impression = (n: number): PromotionEvent => ({ kind: "IMPRESSION", adBookingId: `ad${n}`, surface: "WEB_LISTING" });

describe("LM-1: event batching", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("sends together a short while after the first event", () => {
        const send = vi.fn();
        const batcher = createEventBatcher({ send, delayMs: 2000 });
        batcher.push(impression(1));
        batcher.push({ kind: "CLICK", boostId: "b1", surface: "WEB_EXPLORE" });
        expect(send).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2000);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]![0]).toHaveLength(2);
        expect(batcher.pending()).toBe(0);
    });

    it("never sends more than fifty at once, and sends at once when the batch fills", () => {
        const send = vi.fn();
        const batcher = createEventBatcher({ send });
        for (let n = 0; n < 50; n += 1) batcher.push(impression(n));
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0]![0]).toHaveLength(50);
        for (let n = 0; n < 70; n += 1) batcher.push(impression(n));
        batcher.flush();
        expect(send.mock.calls.map((call) => (call[0] as unknown[]).length)).toEqual([50, 50, 20]);
    });

    it("drops an event that names nothing, and a failing send never throws", async () => {
        const send = vi.fn().mockRejectedValue(new Error("offline"));
        const batcher = createEventBatcher({ send });
        batcher.push({ kind: "IMPRESSION", surface: "WEB_HOME" });
        expect(batcher.pending()).toBe(0);
        batcher.push(impression(1));
        expect(() => batcher.flush()).not.toThrow();
        await Promise.resolve();
        expect(send).toHaveBeenCalledTimes(1);
    });
});

describe("LM-1: the impression rule — half on screen for a second", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("counts once the item has stayed at least half visible for a second", () => {
        const onSeen = vi.fn();
        const dwell = createDwellTimer({ onSeen });
        dwell.update(0.6);
        vi.advanceTimersByTime(999);
        expect(onSeen).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onSeen).toHaveBeenCalledTimes(1);
        dwell.update(0);
        dwell.update(1);
        vi.advanceTimersByTime(5000);
        expect(onSeen).toHaveBeenCalledTimes(1);
    });

    it("less than half, or scrolled away before the second is up, is not seen", () => {
        const onSeen = vi.fn();
        const dwell = createDwellTimer({ onSeen });
        dwell.update(0.49);
        vi.advanceTimersByTime(3000);
        dwell.update(0.5);
        vi.advanceTimersByTime(600);
        dwell.update(0.2);
        vi.advanceTimersByTime(600);
        expect(onSeen).not.toHaveBeenCalled();
        dwell.update(0.9);
        vi.advanceTimersByTime(1000);
        expect(onSeen).toHaveBeenCalledTimes(1);
    });
});

describe("LM-1: once per page view", () => {
    beforeEach(() => {
        resetPageViews();
        window.sessionStorage.clear();
    });

    it("an item counts once per page view, and again on the next view", () => {
        const first = markPageView("/spaces");
        expect(markPageView("/spaces")).toBe(first);
        expect(firstSightThisView("ad:a1")).toBe(true);
        expect(firstSightThisView("ad:a1")).toBe(false);
        expect(firstSightThisView("boost:b1")).toBe(true);
        const next = markPageView("/spaces/LST-1");
        expect(next).toBe(first + 1);
        expect(firstSightThisView("ad:a1")).toBe(true);
    });

    it("keeps counting views across loads of the tab", () => {
        markPageView("/a");
        resetPageViews();
        expect(markPageView("/a")).toBe(2);
    });
});
