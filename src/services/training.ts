import { api, ApiError } from "@/lib/api-client";

/**
 * Training on the web — the ADX app's training pane
 * (`mobile/user-app/src/features/training/training-pane.tsx` over
 * `mobile/shared/features/training/*`): the curriculum, a module, its quiz,
 * the certificate, and the library every side reads (`GET /training`).
 *
 * The rules the app keeps, kept here: the state is the server's (nothing
 * re-derives a row's state or percent); progress is only what the page can
 * honestly claim — opened (10, the server's on first read), video opened
 * (40), lesson read (70) — and only a passed quiz makes 100; correctness
 * never crosses the wire; and the curriculum is the agent's, so a publisher
 * gets a 404 there, which is not a failure — the library is theirs.
 */

export interface TrainingResource {
    id: string;
    title: string;
    category: string;
    duration: string | null;
    subtitle: string | null;
    topic: string | null;
    status: string | null;
    statusVariant: string | null;
    videoUrl: string | null;
    documentUrl: string | null;
}

export type ModuleState = "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "LOCKED";
export type TrainingModuleKind = "LESSON" | "ASSESSMENT";

export interface BestAttempt {
    score: number;
    total: number;
    passed: boolean;
}

export interface ModuleRow {
    id: string;
    ordinal: number;
    title: string;
    summary: string | null;
    durationMins: number | null;
    kind?: TrainingModuleKind;
    timeLimitMins?: number | null;
    state: ModuleState;
    percent: number;
    best: BestAttempt | null;
}

export type CertificationState = "LOCKED" | "CERTIFIED" | "REVOKED";

export interface CertificationView {
    state: CertificationState;
    progress: { passed: number; total: number; pct: number };
    certificateId: string | null;
    issuedAt: string | null;
    agentName: string | null;
    remaining: string[];
}

export interface Curriculum {
    modules: ModuleRow[];
    resume: ModuleRow | null;
    certification: CertificationView;
}

export interface NextModule {
    id: string;
    ordinal: number;
    title: string;
}

export interface ModuleView extends ModuleRow {
    videoUrl: string | null;
    lessonBody: string | null;
    transcript: string | null;
    takeaways: string[];
    passPercent: number;
    lastPositionSec: number | null;
    questionCount: number;
    next: NextModule | null;
}

export interface QuizOption {
    id: string;
    ordinal: number;
    label: string;
}

export interface QuizQuestion {
    id: string;
    ordinal: number;
    prompt: string;
    options: QuizOption[];
}

export interface QuizView {
    moduleId: string;
    passPercent: number;
    timeLimitMins?: number | null;
    kind?: TrainingModuleKind;
    questions: QuizQuestion[];
}

export interface QuizAnswer {
    questionId: string;
    optionId: string;
}

export interface QuizResult {
    score: number;
    total: number;
    passed: boolean;
    line: string;
    module: ModuleRow;
    next: NextModule | null;
    certification: CertificationView;
}

export const trainingService = {
    library: (category?: string) => api.get<TrainingResource[]>(category && category !== "All" ? `/training?category=${encodeURIComponent(category)}` : "/training"),
    curriculum: () => api.get<Curriculum>("/training/curriculum"),
    module: (moduleId: string) => api.get<ModuleView>(`/training/modules/${encodeURIComponent(moduleId)}`),
    progress: (moduleId: string, input: { percent: number }) => api.post<ModuleRow>(`/training/modules/${encodeURIComponent(moduleId)}/progress`, input),
    quiz: (moduleId: string) => api.get<QuizView>(`/training/modules/${encodeURIComponent(moduleId)}/quiz`),
    submitQuiz: (moduleId: string, answers: QuizAnswer[]) => api.post<QuizResult>(`/training/modules/${encodeURIComponent(moduleId)}/quiz`, { answers }),
    certification: () => api.get<CertificationView>("/training/certification"),
};

export const PROGRESS_STEPS = { OPENED: 10, VIDEO: 40, LESSON_READ: 70, PASSED: 100 } as const;

export const NOT_AGENT_LINE = "The modules and the certification are for ADX agents. The library below is for everyone.";
export const LOCKED_NOTE = "Finish the module before this one first.";
export const NO_VIDEO_LINE = "No video for this module";
export const REVOKED_LINE = "Your certificate was revoked. Ask ADX support why, and what to do next.";

/** A 404 on the curriculum is a session with no agent profile, not a failure. */
export function isNotAgent(caught: unknown): boolean {
    return caught instanceof ApiError && caught.status === 404;
}

export function durationLabel(mins: number | null): string | null {
    return mins === null ? null : `${mins} min`;
}

export function moduleEyebrow(ordinal: number): string {
    return `Module ${ordinal}`;
}

/** The trailing value on an index row: the best score or clock on a test; "60%", the duration or "Locked" on a lesson. */
export function rowTrailing(row: Pick<ModuleRow, "state" | "percent" | "durationMins" | "kind" | "timeLimitMins" | "best">): string | null {
    if (row.kind === "ASSESSMENT") {
        if (row.best) return `Best ${row.best.score}/${row.best.total}`;
        return row.timeLimitMins ? `Test · ${row.timeLimitMins} min` : "Test";
    }
    switch (row.state) {
        case "COMPLETED":
            return null;
        case "IN_PROGRESS":
            return `${row.percent}%`;
        case "NOT_STARTED":
            return durationLabel(row.durationMins);
        case "LOCKED":
            return "Locked";
    }
}

export type CertificationRow = { label: string; trailing: string | null; kind: CertificationState };

export function certificationRow(cert: Pick<CertificationView, "state" | "certificateId">): CertificationRow {
    switch (cert.state) {
        case "CERTIFIED":
            return { label: `Certified · ${cert.certificateId ?? ""}`.trim(), trailing: null, kind: "CERTIFIED" };
        case "REVOKED":
            return { label: "Certification exam", trailing: "Revoked", kind: "REVOKED" };
        default:
            return { label: "Certification exam", trailing: "Locked", kind: "LOCKED" };
    }
}

export function libraryCategories(items: Pick<TrainingResource, "category">[]): string[] {
    return ["All", ...Array.from(new Set(items.map((item) => item.category)))];
}

export function resourceUrl(item: Pick<TrainingResource, "videoUrl" | "documentUrl">): string | null {
    return item.videoUrl ?? item.documentUrl ?? null;
}

export function resourceMeta(item: Pick<TrainingResource, "category" | "duration" | "status">): string {
    return [item.category, item.duration, item.status].filter(Boolean).join(" · ");
}

export type PlayerAction = { kind: "RESUME" | "QUIZ" | "REVIEW" | "NONE"; label: string; enabled: boolean };

/** The player's one button: back to the lesson until it has been read, then the quiz, then the best score. */
export function playerAction(view: Pick<ModuleView, "state" | "percent" | "questionCount">): PlayerAction {
    if (view.state === "COMPLETED") return { kind: "REVIEW", label: "Review quiz result", enabled: true };
    if (view.percent < PROGRESS_STEPS.LESSON_READ) return { kind: "RESUME", label: "Resume lesson", enabled: true };
    if (view.questionCount > 0) return { kind: "QUIZ", label: "Take the quiz", enabled: true };
    return { kind: "NONE", label: "No quiz yet", enabled: false };
}

export function bestLine(best: BestAttempt | null): string {
    if (!best) return "No attempt recorded yet";
    return `Best score ${best.score}/${best.total} — ${best.passed ? "passed" : "not passed"}`;
}

export function questionHeader(index: number, total: number): string {
    return `Question ${index + 1} of ${total}`;
}

export function nextLabel(index: number, total: number): string {
    return index >= total - 1 ? "Submit" : "Next question";
}

/** The answers the server scores, in question order, only the ones chosen. */
export function answersOf(questions: Pick<QuizQuestion, "id">[], chosen: Record<string, string>): QuizAnswer[] {
    return questions.flatMap((question) => {
        const optionId = chosen[question.id];
        return optionId ? [{ questionId: question.id, optionId }] : [];
    });
}

export function completeTitle(ordinal: number): string {
    return `Module ${ordinal} complete`;
}

export function certProgressLine(progress: Pick<CertificationView["progress"], "passed" | "total">): string {
    return `${progress.passed} of ${progress.total} modules`;
}

export type CompleteAction = { kind: "NEXT"; label: string; moduleId: string } | { kind: "CERTIFICATE"; label: string } | { kind: "DONE"; label: string };

export function completeAction(result: Pick<QuizResult, "next" | "certification">): CompleteAction {
    if (result.next) return { kind: "NEXT", label: `Start module ${result.next.ordinal}`, moduleId: result.next.id };
    if (result.certification.state === "CERTIFIED") return { kind: "CERTIFICATE", label: "View certificate" };
    return { kind: "DONE", label: "Back to training" };
}

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function certifiedDate(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return `${at.getDate()} ${MONTHS_LONG[at.getMonth()]} ${at.getFullYear()}`;
}

export function remainingLine(remaining: string[]): string | null {
    if (remaining.length === 0) return null;
    return `${remaining.length} ${remaining.length === 1 ? "module" : "modules"} to go: ${remaining.join(", ")}`;
}

/** The text a share carries — the name, the id and the date; nothing that is not on the record. */
export function shareLine(cert: { agentName: string | null; certificateId: string; issuedAt: string | null }): string {
    const who = cert.agentName ?? "This agent";
    const when = cert.issuedAt ? `, issued ${certifiedDate(cert.issuedAt)}` : "";
    return `${who} is an ADX Certified Agent — certificate ${cert.certificateId}${when}.`;
}

/**
 * The lesson's Markdown as blocks the page draws without a Markdown library:
 * headings, bullet lists and paragraphs. Inline marks are kept as text.
 */
export type LessonBlock = { kind: "heading"; level: 1 | 2 | 3; text: string } | { kind: "list"; items: string[] } | { kind: "paragraph"; text: string };

export function lessonBlocks(markdown: string): LessonBlock[] {
    const blocks: LessonBlock[] = [];
    let paragraph: string[] = [];
    let list: string[] | null = null;
    const flush = () => {
        if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
        paragraph = [];
        if (list) blocks.push({ kind: "list", items: list });
        list = null;
    };
    for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
        const line = raw.trim();
        if (!line) {
            flush();
            continue;
        }
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) {
            flush();
            blocks.push({ kind: "heading", level: heading[1]!.length as 1 | 2 | 3, text: strip(heading[2]!) });
            continue;
        }
        const bullet = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
        if (bullet) {
            if (paragraph.length) {
                blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
                paragraph = [];
            }
            list = list ?? [];
            list.push(strip(bullet[1]!));
            continue;
        }
        if (list) {
            blocks.push({ kind: "list", items: list });
            list = null;
        }
        paragraph.push(strip(line));
    }
    flush();
    return blocks;
}

/** Drops the inline marks a plain reader would see as noise: **bold**, _italic_, `code`, [text](link). */
function strip(text: string): string {
    return text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/(\*\*|__)(.+?)\1/g, "$2")
        .replace(/(\*|_)(.+?)\1/g, "$2")
        .replace(/`([^`]+)`/g, "$1");
}
