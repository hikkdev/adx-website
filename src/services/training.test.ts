import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
    answersOf,
    bestLine,
    certificationRow,
    certProgressLine,
    completeAction,
    isNotAgent,
    lessonBlocks,
    libraryCategories,
    nextLabel,
    playerAction,
    remainingLine,
    resourceMeta,
    resourceUrl,
    rowTrailing,
    shareLine,
    trainingService,
    type CertificationView,
} from "./training";

afterEach(() => {
    vi.unstubAllGlobals();
});

const cert = (over: Partial<CertificationView> = {}): CertificationView => ({ state: "LOCKED", progress: { passed: 2, total: 5, pct: 40 }, certificateId: null, issuedAt: null, agentName: null, remaining: [], ...over });

describe("the index", () => {
    it("says what a row's trailing slot says, by state and by kind", () => {
        expect(rowTrailing({ state: "COMPLETED", percent: 100, durationMins: 12, best: null })).toBeNull();
        expect(rowTrailing({ state: "IN_PROGRESS", percent: 40, durationMins: 12, best: null })).toBe("40%");
        expect(rowTrailing({ state: "NOT_STARTED", percent: 0, durationMins: 12, best: null })).toBe("12 min");
        expect(rowTrailing({ state: "LOCKED", percent: 0, durationMins: 12, best: null })).toBe("Locked");
        expect(rowTrailing({ state: "NOT_STARTED", percent: 0, durationMins: null, kind: "ASSESSMENT", timeLimitMins: 20, best: null })).toBe("Test · 20 min");
        expect(rowTrailing({ state: "COMPLETED", percent: 100, durationMins: null, kind: "ASSESSMENT", best: { score: 8, total: 10, passed: true } })).toBe("Best 8/10");
    });

    it("draws the certification row", () => {
        expect(certificationRow(cert())).toEqual({ label: "Certification exam", trailing: "Locked", kind: "LOCKED" });
        expect(certificationRow(cert({ state: "CERTIFIED", certificateId: "ADX-CERT-1" }))).toEqual({ label: "Certified · ADX-CERT-1", trailing: null, kind: "CERTIFIED" });
        expect(certificationRow(cert({ state: "REVOKED" })).trailing).toBe("Revoked");
    });

    it("treats a 404 on the curriculum as no curriculum, not a failure", () => {
        expect(isNotAgent(new ApiError(404, "NOT_FOUND", "no agent"))).toBe(true);
        expect(isNotAgent(new ApiError(500, "X", "x"))).toBe(false);
    });

    it("lays out the library", () => {
        expect(libraryCategories([{ category: "Onboarding" }, { category: "Sales" }, { category: "Onboarding" }])).toEqual(["All", "Onboarding", "Sales"]);
        expect(resourceUrl({ videoUrl: null, documentUrl: "d" })).toBe("d");
        expect(resourceMeta({ category: "Onboarding", duration: "6 min", status: null })).toBe("Onboarding · 6 min");
    });
});

describe("a module and its quiz", () => {
    it("offers the lesson until it is read, then the quiz, then the best score", () => {
        expect(playerAction({ state: "IN_PROGRESS", percent: 40, questionCount: 5 }).kind).toBe("RESUME");
        expect(playerAction({ state: "IN_PROGRESS", percent: 70, questionCount: 5 })).toEqual({ kind: "QUIZ", label: "Take the quiz", enabled: true });
        expect(playerAction({ state: "IN_PROGRESS", percent: 70, questionCount: 0 }).enabled).toBe(false);
        expect(playerAction({ state: "COMPLETED", percent: 100, questionCount: 5 }).kind).toBe("REVIEW");
        expect(bestLine({ score: 5, total: 5, passed: true })).toBe("Best score 5/5 — passed");
        expect(bestLine(null)).toBe("No attempt recorded yet");
    });

    it("sends only the chosen answers, in question order", () => {
        expect(answersOf([{ id: "q1" }, { id: "q2" }, { id: "q3" }], { q3: "c", q1: "a" })).toEqual([
            { questionId: "q1", optionId: "a" },
            { questionId: "q3", optionId: "c" },
        ]);
        expect(nextLabel(0, 3)).toBe("Next question");
        expect(nextLabel(2, 3)).toBe("Submit");
    });

    it("goes on to the next module, the certificate, or back", () => {
        expect(completeAction({ next: { id: "m5", ordinal: 5, title: "x" }, certification: cert() })).toEqual({ kind: "NEXT", label: "Start module 5", moduleId: "m5" });
        expect(completeAction({ next: null, certification: cert({ state: "CERTIFIED" }) }).kind).toBe("CERTIFICATE");
        expect(completeAction({ next: null, certification: cert() }).kind).toBe("DONE");
        expect(certProgressLine({ passed: 4, total: 8 })).toBe("4 of 8 modules");
        expect(remainingLine([])).toBeNull();
        expect(remainingLine(["Safety"])).toBe("1 module to go: Safety");
        expect(shareLine({ agentName: null, certificateId: "C-1", issuedAt: "2026-04-04T00:00:00Z" })).toBe("This agent is an ADX Certified Agent — certificate C-1, issued 4 April 2026.");
    });

    it("reads a lesson's Markdown into headings, lists and paragraphs", () => {
        expect(lessonBlocks("# Welcome\n\nThis is **bold** and [a link](http://x).\nStill the same paragraph.\n\n- one\n- `two`\n\n1. first\n\nEnd")).toEqual([
            { kind: "heading", level: 1, text: "Welcome" },
            { kind: "paragraph", text: "This is bold and a link. Still the same paragraph." },
            { kind: "list", items: ["one", "two"] },
            { kind: "list", items: ["first"] },
            { kind: "paragraph", text: "End" },
        ]);
    });

    it("reports progress and submits answers on the module's routes", async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init: RequestInit) => {
                calls.push({ url, init });
                return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
            })
        );
        await trainingService.library("Sales");
        await trainingService.library("All");
        await trainingService.progress("m1", { percent: 70 });
        await trainingService.submitQuiz("m1", [{ questionId: "q", optionId: "o" }]);
        expect(calls.map((c) => `${c.init.method} ${c.url.replace(/^.*\/api\/v1/, "")}`)).toEqual(["GET /training?category=Sales", "GET /training", "POST /training/modules/m1/progress", "POST /training/modules/m1/quiz"]);
        expect(JSON.parse(String(calls[3]!.init.body))).toEqual({ answers: [{ questionId: "q", optionId: "o" }] });
    });
});
