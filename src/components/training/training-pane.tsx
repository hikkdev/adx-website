"use client";

import * as React from "react";
import { Award, Check, ChevronLeft, ExternalLink, Lock, Play } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/workspace/page-heading";
import { btnOutline, btnPrimary, btnSmall } from "@/components/advertiser/bits";
import {
    answersOf,
    bestLine,
    certificationRow,
    certifiedDate,
    certProgressLine,
    completeAction,
    completeTitle,
    durationLabel,
    isNotAgent,
    lessonBlocks,
    libraryCategories,
    LOCKED_NOTE,
    moduleEyebrow,
    nextLabel,
    NO_VIDEO_LINE,
    NOT_AGENT_LINE,
    playerAction,
    PROGRESS_STEPS,
    questionHeader,
    remainingLine,
    resourceMeta,
    resourceUrl,
    REVOKED_LINE,
    rowTrailing,
    shareLine,
    trainingService,
    type CertificationView,
    type Curriculum,
    type ModuleRow,
    type ModuleView,
    type QuizResult,
    type QuizView,
    type TrainingResource,
} from "@/services/training";

type Place = { at: "INDEX" } | { at: "MODULE"; moduleId: string } | { at: "QUIZ"; moduleId: string } | { at: "COMPLETE"; result: QuizResult } | { at: "CERTIFICATE" };

/**
 * The app's training pane on the web: the index (the curriculum when the
 * session has one, and the library everybody reads), a module, its quiz,
 * the module-complete screen and the certificate — the position held here,
 * each screen mounted afresh when it changes so a module returned to after
 * a quiz reads itself again.
 */
export function TrainingPane() {
    const [place, setPlace] = React.useState<Place>({ at: "INDEX" });
    const top = () => window.scrollTo({ top: 0 });
    const go = (next: Place) => {
        setPlace(next);
        top();
    };

    switch (place.at) {
        case "MODULE":
            return <ModulePlayer key={place.moduleId} moduleId={place.moduleId} onBack={() => go({ at: "INDEX" })} onQuiz={(moduleId) => go({ at: "QUIZ", moduleId })} />;
        case "QUIZ":
            return <Quiz moduleId={place.moduleId} onBack={() => go({ at: "MODULE", moduleId: place.moduleId })} onPassed={(result) => go({ at: "COMPLETE", result })} />;
        case "COMPLETE":
            return <ModuleComplete result={place.result} onNext={(moduleId) => go({ at: "MODULE", moduleId })} onCertificate={() => go({ at: "CERTIFICATE" })} onDone={() => go({ at: "INDEX" })} />;
        case "CERTIFICATE":
            return <Certificate onBack={() => go({ at: "INDEX" })} />;
        default:
            return <TrainingIndex onModule={(moduleId) => go({ at: "MODULE", moduleId })} onCertificate={() => go({ at: "CERTIFICATE" })} />;
    }
}

/* ------------------------------------------------------------------ */
/* The index                                                           */
/* ------------------------------------------------------------------ */

function TrainingIndex({ onModule, onCertificate }: { onModule: (moduleId: string) => void; onCertificate: () => void }) {
    const [curriculum, setCurriculum] = React.useState<Curriculum | "NOT_AGENT" | null | undefined>(undefined);
    const [curriculumError, setCurriculumError] = React.useState<string | null>(null);
    const [library, setLibrary] = React.useState<TrainingResource[] | null>(null);
    const [libraryError, setLibraryError] = React.useState<string | null>(null);
    const [category, setCategory] = React.useState("All");
    const [lockedRow, setLockedRow] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        void Promise.allSettled([trainingService.curriculum(), trainingService.library()]).then(([index, list]) => {
            if (cancelled) return;
            if (index.status === "fulfilled") setCurriculum(index.value);
            else if (isNotAgent(index.reason)) setCurriculum("NOT_AGENT");
            else {
                setCurriculum(null);
                setCurriculumError(messageOf(index.reason, "Could not reach ADX."));
            }
            if (list.status === "fulfilled") setLibrary(list.value);
            else {
                setLibrary([]);
                setLibraryError(messageOf(list.reason, "Could not reach ADX."));
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const open = (row: ModuleRow) => {
        if (row.state === "LOCKED") return setLockedRow(row.id);
        setLockedRow(null);
        onModule(row.id);
    };

    const modules = curriculum && curriculum !== "NOT_AGENT" ? curriculum : null;
    const resume = modules?.resume ?? null;
    const cert = modules ? certificationRow(modules.certification) : null;
    const shown = (library ?? []).filter((item) => category === "All" || item.category === category);

    return (
        <>
            <PageHeading title="Training" subtitle="Guides and lessons for running your spaces on ADX" />
            <div className="mt-6 grid max-w-[920px] gap-4">
                {curriculumError && <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{curriculumError}</p>}
                {curriculum === undefined ? (
                    <p className="text-sm text-dim">Loading your training…</p>
                ) : curriculum === "NOT_AGENT" ? (
                    <p className="rounded-md bg-ground px-4 py-3 text-sm text-dim">{NOT_AGENT_LINE}</p>
                ) : modules ? (
                    <>
                        {resume && (
                            <button type="button" onClick={() => open(resume)} className="flex items-center gap-4 rounded-lg border border-line bg-white p-5 text-left hover:border-ink">
                                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-brand text-white">
                                    <Play className="size-5" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand-bright">{moduleEyebrow(resume.ordinal)}</span>
                                    <span className="block truncate text-base font-semibold text-ink">{resume.title}</span>
                                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ground">
                                        <span className="block h-full bg-brand" style={{ width: `${resume.percent}%` }} />
                                    </span>
                                </span>
                                <span className="text-sm font-semibold text-ink">Continue</span>
                            </button>
                        )}
                        <section className="rounded-lg border border-line bg-white">
                            <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold text-ink">All modules</h2>
                            <ul className="divide-y divide-line">
                                {modules.modules.map((row) => {
                                    const trailing = rowTrailing(row);
                                    return (
                                        <li key={row.id}>
                                            <button type="button" onClick={() => open(row)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-ground">
                                                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", row.state === "COMPLETED" ? "bg-success text-white" : row.state === "IN_PROGRESS" ? "bg-brand-soft text-brand" : "bg-ground text-dim")}>
                                                    {row.state === "COMPLETED" ? <Check className="size-4" aria-hidden /> : row.state === "LOCKED" ? <Lock className="size-3.5" aria-hidden /> : row.ordinal}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className={cn("block text-sm", row.state === "LOCKED" ? "text-dim" : "font-medium text-ink")}>{row.title}</span>
                                                    {lockedRow === row.id ? <span className="block text-xs text-warning">{LOCKED_NOTE}</span> : row.summary && <span className="block truncate text-xs text-dim">{row.summary}</span>}
                                                </span>
                                                {trailing && <span className="text-xs text-dim">{trailing}</span>}
                                            </button>
                                        </li>
                                    );
                                })}
                                {cert && (
                                    <li>
                                        <button type="button" onClick={() => (cert.kind === "LOCKED" ? undefined : onCertificate())} className={cn("flex w-full items-center gap-4 px-5 py-3.5 text-left", cert.kind === "LOCKED" ? "cursor-default" : "hover:bg-ground")}>
                                            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", cert.kind === "CERTIFIED" ? "bg-success text-white" : "bg-ground text-dim")}>
                                                {cert.kind === "LOCKED" ? <Lock className="size-3.5" aria-hidden /> : <Award className="size-4" aria-hidden />}
                                            </span>
                                            <span className={cn("min-w-0 flex-1 text-sm", cert.kind === "CERTIFIED" ? "font-medium text-success" : "text-ink")}>{cert.label}</span>
                                            {cert.trailing && <span className="text-xs text-dim">{cert.trailing}</span>}
                                        </button>
                                    </li>
                                )}
                            </ul>
                        </section>
                    </>
                ) : null}

                <section className="rounded-lg border border-line bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                        <h2 className="text-sm font-semibold text-ink">Library</h2>
                        {library && library.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {libraryCategories(library).map((name) => (
                                    <button key={name} type="button" onClick={() => setCategory(name)} aria-pressed={category === name} className={cn("h-7 rounded-full border px-3 text-xs font-medium", category === name ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink")}>
                                        {name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {libraryError && <p className="px-5 pt-3 text-sm text-danger">{libraryError}</p>}
                    {library === null ? (
                        <p className="px-5 py-4 text-sm text-dim">Loading the library…</p>
                    ) : shown.length === 0 ? (
                        <p className="px-5 py-4 text-sm text-dim">Nothing in the library yet.</p>
                    ) : (
                        <ul className="divide-y divide-line">
                            {shown.map((item) => {
                                const url = resourceUrl(item);
                                return (
                                    <li key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-bright">
                                            <Play className="size-4" aria-hidden />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium text-ink">{item.title}</span>
                                            <span className="block text-xs text-dim">{item.subtitle ?? resourceMeta(item)}</span>
                                        </span>
                                        {url ? (
                                            <a href={url} target="_blank" rel="noreferrer" className={cn(btnSmall, "gap-1.5")}>
                                                Open <ExternalLink className="size-3.5" aria-hidden />
                                            </a>
                                        ) : (
                                            <span className="text-xs text-dim">Coming soon</span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* The module                                                          */
/* ------------------------------------------------------------------ */

function ModulePlayer({ moduleId, onBack, onQuiz }: { moduleId: string; onBack: () => void; onQuiz: (moduleId: string) => void }) {
    const [view, setView] = React.useState<ModuleView | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [tab, setTab] = React.useState<"LESSON" | "TRANSCRIPT">("LESSON");
    const [showResult, setShowResult] = React.useState(false);
    const reported = React.useRef(0);
    const lessonRef = React.useRef<HTMLDivElement>(null);
    const endRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        let cancelled = false;
        trainingService
            .module(moduleId)
            .then((next) => {
                if (cancelled) return;
                reported.current = next.percent;
                setView(next);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setError(messageOf(caught, "Could not reach ADX."));
            });
        return () => {
            cancelled = true;
        };
    }, [moduleId]);

    /** Posts a step when it climbs; only a passed quiz makes 100. */
    const report = React.useCallback(
        async (percent: number) => {
            if (!view || view.state === "COMPLETED" || view.percent >= percent || reported.current >= percent) return;
            reported.current = percent;
            try {
                const row = await trainingService.progress(moduleId, { percent });
                setView((current) => (current ? { ...current, ...row } : current));
            } catch (caught) {
                reported.current = view.percent;
                setError(messageOf(caught, "That did not go through."));
            }
        },
        [moduleId, view]
    );

    /* Reading to the end of the lesson is the "lesson read" step. */
    React.useEffect(() => {
        const end = endRef.current;
        if (!end || tab !== "LESSON" || !view?.lessonBody) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) void report(PROGRESS_STEPS.LESSON_READ);
        });
        observer.observe(end);
        return () => observer.disconnect();
    }, [tab, view?.lessonBody, report]);

    const action = view ? playerAction(view) : null;
    const primary = () => {
        if (!view || !action) return;
        if (action.kind === "RESUME") {
            setTab("LESSON");
            lessonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            if (!view.lessonBody) void report(PROGRESS_STEPS.LESSON_READ);
        } else if (action.kind === "QUIZ") onQuiz(view.id);
        else if (action.kind === "REVIEW") setShowResult(true);
    };

    const duration = view ? durationLabel(view.durationMins) : null;

    return (
        <>
            <BackLink label="Training" onClick={onBack} />
            {error && <p className="mt-4 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
            {!view ? (
                !error && <p className="mt-6 text-sm text-dim">Loading the module…</p>
            ) : (
                <div className="mt-4 grid max-w-[860px] gap-4">
                    {view.videoUrl ? (
                        <a href={view.videoUrl} target="_blank" rel="noreferrer" onClick={() => void report(PROGRESS_STEPS.VIDEO)} className="flex aspect-video items-center justify-center rounded-lg bg-ink text-white hover:opacity-90">
                            <span className="flex flex-col items-center gap-2">
                                <span className="flex size-14 items-center justify-center rounded-full bg-white text-brand">
                                    <Play className="size-6" aria-hidden />
                                </span>
                                <span className="text-sm">Open the video{duration ? ` · ${duration}` : ""}</span>
                            </span>
                        </a>
                    ) : (
                        <div className="flex aspect-[3/1] items-center justify-center rounded-lg bg-ground text-sm text-dim">{NO_VIDEO_LINE}</div>
                    )}
                    <section className="rounded-lg border border-line bg-white p-6">
                        <h1 className="text-2xl font-semibold tracking-tight text-ink">{view.title}</h1>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded bg-brand-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand">{moduleEyebrow(view.ordinal)}</span>
                            {duration && <span className="rounded bg-ground px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-dim">{duration}</span>}
                        </div>
                        <div ref={lessonRef} className="mt-5 flex scroll-mt-24 gap-1 border-b border-line">
                            {(["LESSON", "TRANSCRIPT"] as const).map((value) => (
                                <button key={value} type="button" onClick={() => setTab(value)} aria-pressed={tab === value} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === value ? "border-brand font-semibold text-ink" : "border-transparent text-dim hover:text-ink")}>
                                    {value === "LESSON" ? "Lesson" : "Transcript"}
                                </button>
                            ))}
                        </div>
                        <div className="mt-4">
                            {tab === "LESSON" ? (
                                view.lessonBody ? (
                                    <Lesson markdown={view.lessonBody} />
                                ) : (
                                    <p className="text-sm text-dim">No lesson text for this module yet.</p>
                                )
                            ) : view.transcript ? (
                                <p className="whitespace-pre-line text-sm text-ink">{view.transcript}</p>
                            ) : (
                                <p className="text-sm text-dim">No transcript for this module.</p>
                            )}
                            {tab === "LESSON" && view.takeaways.length > 0 && (
                                <div className="mt-5 rounded-md bg-ground px-4 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-dim">Key takeaways</p>
                                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                                        {view.takeaways.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <div ref={endRef} aria-hidden className="h-px" />
                        </div>
                        {showResult && <p className="mt-5 rounded-md bg-success-soft px-4 py-3 text-sm text-ink">{bestLine(view.best)}</p>}
                        {action && (
                            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                                <p className="text-xs text-dim">{view.state === "COMPLETED" ? "Completed" : `${view.percent}% done · pass mark ${view.passPercent}%`}</p>
                                <button type="button" onClick={primary} className={btnPrimary} disabled={!action.enabled}>
                                    {action.label}
                                </button>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </>
    );
}

function Lesson({ markdown }: { markdown: string }) {
    const blocks = React.useMemo(() => lessonBlocks(markdown), [markdown]);
    return (
        <div className="space-y-3">
            {blocks.map((block, index) =>
                block.kind === "heading" ? (
                    <p key={index} className={cn("font-semibold text-ink", block.level === 1 ? "text-lg" : "text-base")}>
                        {block.text}
                    </p>
                ) : block.kind === "list" ? (
                    <ul key={index} className="list-disc space-y-1 pl-5 text-sm text-ink">
                        {block.items.map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                ) : (
                    <p key={index} className="text-sm leading-relaxed text-ink">
                        {block.text}
                    </p>
                )
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The quiz                                                            */
/* ------------------------------------------------------------------ */

function Quiz({ moduleId, onBack, onPassed }: { moduleId: string; onBack: () => void; onPassed: (result: QuizResult) => void }) {
    const [quiz, setQuiz] = React.useState<QuizView | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [index, setIndex] = React.useState(0);
    const [chosen, setChosen] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);
    const [failed, setFailed] = React.useState<QuizResult | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        trainingService
            .quiz(moduleId)
            .then((next) => {
                if (!cancelled) setQuiz(next);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setError(messageOf(caught, "Could not open the quiz."));
            });
        return () => {
            cancelled = true;
        };
    }, [moduleId]);

    if (!quiz) {
        return (
            <>
                <BackLink label="Module" onClick={onBack} />
                <p className={cn("mt-6 text-sm", error ? "text-danger" : "text-dim")}>{error ?? "Loading the quiz…"}</p>
            </>
        );
    }

    const total = quiz.questions.length;
    const question = quiz.questions[index];

    const next = async () => {
        if (!question || !chosen[question.id]) return;
        if (index < total - 1) return setIndex(index + 1);
        setBusy(true);
        setError(null);
        try {
            const result = await trainingService.submitQuiz(moduleId, answersOf(quiz.questions, chosen));
            if (result.passed) onPassed(result);
            else setFailed(result);
        } catch (caught) {
            setError(messageOf(caught, "Could not submit your answers."));
        } finally {
            setBusy(false);
        }
    };

    if (failed) {
        return (
            <>
                <BackLink label="Module" onClick={onBack} />
                <section className="mt-6 max-w-[640px] rounded-lg border border-line bg-white p-6 text-center">
                    <p className="text-lg font-semibold text-ink">{failed.line}</p>
                    <p className="mt-1 text-sm text-dim">The pass mark is {quiz.passPercent}%. Read the lesson again and have another go.</p>
                    <div className="mt-5 flex justify-center gap-2">
                        <button type="button" onClick={onBack} className={btnOutline}>
                            Back to the lesson
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setFailed(null);
                                setChosen({});
                                setIndex(0);
                            }}
                            className={btnPrimary}
                        >
                            Try again
                        </button>
                    </div>
                </section>
            </>
        );
    }

    return (
        <>
            <BackLink label="Module" onClick={onBack} />
            <section className="mt-6 max-w-[640px] rounded-lg border border-line bg-white p-6">
                {total === 0 || !question ? (
                    <p className="text-sm text-dim">This module has no quiz yet.</p>
                ) : (
                    <>
                        <p className="text-xs font-medium text-dim">{questionHeader(index, total)}</p>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-ground">
                            <div className="h-full bg-brand" style={{ width: `${((index + 1) / total) * 100}%` }} />
                        </div>
                        <p className="mt-5 text-base font-semibold text-ink">{question.prompt}</p>
                        <div role="radiogroup" className="mt-4 grid gap-2">
                            {question.options.map((option) => {
                                const on = chosen[question.id] === option.id;
                                return (
                                    <button key={option.id} type="button" role="radio" aria-checked={on} onClick={() => setChosen((current) => ({ ...current, [question.id]: option.id }))} className={cn("rounded-md border px-4 py-3 text-left text-sm", on ? "border-brand-bright bg-[#fff7f7] font-medium text-ink" : "border-line text-ink hover:border-dim")}>
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
                        <div className="mt-6 flex justify-between gap-2">
                            <button type="button" onClick={() => setIndex(Math.max(0, index - 1))} className={btnOutline} disabled={index === 0 || busy}>
                                Previous
                            </button>
                            <button type="button" onClick={() => void next()} className={btnPrimary} disabled={!chosen[question.id] || busy}>
                                {busy ? "Scoring…" : nextLabel(index, total)}
                            </button>
                        </div>
                    </>
                )}
            </section>
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Module complete, and the certificate                                */
/* ------------------------------------------------------------------ */

function ModuleComplete({ result, onNext, onCertificate, onDone }: { result: QuizResult; onNext: (moduleId: string) => void; onCertificate: () => void; onDone: () => void }) {
    const action = completeAction(result);
    const progress = result.certification.progress;
    return (
        <section className="max-w-[560px] rounded-lg border border-line bg-white p-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success text-white">
                <Check className="size-7" aria-hidden />
            </span>
            <p className="mt-4 text-xl font-semibold text-ink">{completeTitle(result.module.ordinal)}</p>
            <p className="mt-1 text-sm text-dim">{result.line}</p>
            <div className="mt-6 text-left">
                <div className="flex justify-between text-xs text-dim">
                    <span>Certification</span>
                    <span>{certProgressLine(progress)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ground">
                    <div className="h-full bg-success" style={{ width: `${progress.pct}%` }} />
                </div>
            </div>
            <div className="mt-6 flex justify-center gap-2">
                {action.kind !== "DONE" && (
                    <button type="button" onClick={onDone} className={btnOutline}>
                        Back to training
                    </button>
                )}
                <button type="button" onClick={() => (action.kind === "NEXT" ? onNext(action.moduleId) : action.kind === "CERTIFICATE" ? onCertificate() : onDone())} className={btnPrimary}>
                    {action.label}
                </button>
            </div>
        </section>
    );
}

function Certificate({ onBack }: { onBack: () => void }) {
    const [cert, setCert] = React.useState<CertificationView | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        trainingService
            .certification()
            .then((next) => {
                if (!cancelled) setCert(next);
            })
            .catch((caught: unknown) => {
                if (!cancelled) setError(messageOf(caught, "Could not read your certificate."));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const copy = async () => {
        if (!cert?.certificateId) return;
        try {
            await navigator.clipboard.writeText(shareLine({ agentName: cert.agentName, certificateId: cert.certificateId, issuedAt: cert.issuedAt }));
            setCopied(true);
        } catch {
            setError("Your browser would not copy.");
        }
    };

    return (
        <>
            <BackLink label="Training" onClick={onBack} />
            {!cert ? (
                <p className={cn("mt-6 text-sm", error ? "text-danger" : "text-dim")}>{error ?? "Loading your certificate…"}</p>
            ) : cert.state === "CERTIFIED" && cert.certificateId ? (
                <section className="mt-6 max-w-[640px] rounded-lg border-2 border-success bg-white p-8 text-center">
                    <Award className="mx-auto size-12 text-success" aria-hidden />
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-dim">ADX Certified</p>
                    <p className="mt-1 text-2xl font-semibold text-ink">{cert.agentName ?? "You"}</p>
                    <p className="mt-2 text-sm text-dim">
                        Certificate {cert.certificateId}
                        {cert.issuedAt ? ` · issued ${certifiedDate(cert.issuedAt)}` : ""}
                    </p>
                    <button type="button" onClick={() => void copy()} className={cn(btnOutline, "mt-6")}>
                        {copied ? "Copied" : "Copy the certificate line"}
                    </button>
                    {error && <p className="mt-3 text-sm text-danger">{error}</p>}
                </section>
            ) : cert.state === "REVOKED" ? (
                <p className="mt-6 max-w-[640px] rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{REVOKED_LINE}</p>
            ) : (
                <section className="mt-6 max-w-[640px] rounded-lg border border-line bg-white p-6">
                    <p className="text-base font-semibold text-ink">Not certified yet</p>
                    <p className="mt-1 text-sm text-dim">{certProgressLine(cert.progress)} passed.</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-ground">
                        <div className="h-full bg-brand" style={{ width: `${cert.progress.pct}%` }} />
                    </div>
                    {remainingLine(cert.remaining) && <p className="mt-3 text-sm text-ink">{remainingLine(cert.remaining)}</p>}
                </section>
            )}
        </>
    );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden />
            {label}
        </button>
    );
}

