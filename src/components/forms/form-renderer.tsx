"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { messageOf } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { answersToSend, fieldErrorsOf, formsService, isFieldShown, screenOfField, validateScreen, type FormAnswers, type FormView } from "@/services/forms";
import { TickRow } from "./field-box";
import { FormFieldInput } from "./form-fields";

const PRIMARY = "inline-flex h-12 items-center justify-center rounded-[8px] bg-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-[#a51b1b] disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY = "inline-flex h-12 items-center justify-center rounded-[8px] border border-line bg-white px-6 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";

/**
 * FM-1 (27 Sep 2026): a published form on the website. Its screens are
 * steps (one screen, no stepper); every field is drawn by its kind, a
 * field with `dependsOn` only when the answer it waits for is given;
 * required fields carry a red mark; the consent line is a tick with the
 * form's own words. Each step is checked before the next, the answers
 * are sent with `POST /app/forms/:key/submissions`, and the success
 * message takes the form's place. What the API finds wrong is shown
 * beside the field, and the reader is taken back to its step. A
 * SIGNED_IN form asks for a sign-in first.
 */
export function FormRenderer({ form, source, className }: { form: FormView; source?: string; className?: string }) {
    const { status } = useAuth();
    if (form.audience === "SIGNED_IN") {
        if (status === "restoring") return <div className={cn("h-40 animate-pulse rounded-2xl border border-line bg-white", className)} aria-hidden />;
        if (status !== "signed-in") return <SignInCard className={className} />;
    }
    return <FormBody form={form} source={source} className={className} />;
}

function SignInCard({ className }: { className?: string }) {
    const next = typeof window === "undefined" ? "" : window.location.pathname + window.location.search;
    return (
        <div data-testid="form-sign-in" className={cn("rounded-2xl border border-line bg-white p-8 text-center", className)}>
            <p className="text-lg font-semibold text-ink">Sign in to answer</p>
            <p className="mt-1 text-sm text-dim">This form is for ADX accounts — sign in and it opens here.</p>
            <Link href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`} className={cn(PRIMARY, "mt-6")}>
                Sign in
            </Link>
        </div>
    );
}

function FormBody({ form, source, className }: { form: FormView; source?: string; className?: string }) {
    const { definition } = form;
    const screens = definition.screens;
    const multi = screens.length > 1;
    const [step, setStep] = React.useState(0);
    const [answers, setAnswers] = React.useState<FormAnswers>({});
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [consent, setConsent] = React.useState(false);
    const [consentError, setConsentError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const [done, setDone] = React.useState<string | null>(null);
    const top = React.useRef<HTMLFormElement>(null);

    const screen = screens[step]!;
    const last = step === screens.length - 1;
    const shown = screen.fields.filter((field) => isFieldShown(field, answers));

    const answer = (id: string, value: unknown) => {
        setAnswers((current) => ({ ...current, [id]: value }));
        setErrors((current) => {
            if (!(id in current)) return current;
            const next = { ...current };
            delete next[id];
            return next;
        });
    };

    const checkStep = (): boolean => {
        const problems = validateScreen(definition, step, answers);
        setErrors(problems);
        return Object.keys(problems).length === 0;
    };

    const goTo = (index: number) => {
        setStep(index);
        setFailure(null);
        top.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!checkStep()) return;
        if (!last) return goTo(step + 1);
        if (!consent) {
            setConsentError("Tick the box to send your answer.");
            return;
        }
        setConsentError(null);
        setBusy(true);
        setFailure(null);
        try {
            const receipt = await formsService.submit(form.key, { answers: answersToSend(definition, answers), consent: true, ...(source ? { source } : {}) }, form.audience);
            setDone(receipt?.message?.trim() || definition.successMessage);
        } catch (caught) {
            const fieldErrors = fieldErrorsOf(caught);
            const ids = Object.keys(fieldErrors);
            if (ids.length) {
                setErrors(fieldErrors);
                const at = Math.min(...ids.map((id) => screenOfField(definition, id)));
                if (at !== step) goTo(at);
                setFailure("Have a look at the fields marked in red.");
            } else {
                setFailure(messageOf(caught, "Could not send your answer. Try again in a moment."));
            }
        } finally {
            setBusy(false);
        }
    };

    if (done) {
        return (
            <div role="status" data-testid="form-done" className={cn("rounded-2xl border border-line bg-white p-8 text-center", className)}>
                <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
                <p className="mt-4 text-lg font-semibold text-ink">{done}</p>
            </div>
        );
    }

    return (
        <form ref={top} onSubmit={submit} noValidate className={cn("scroll-mt-24 rounded-2xl border border-line bg-white p-6 sm:p-8", className)} data-testid="form-renderer" aria-labelledby={`form-${form.key}-title`}>
            <div className="mb-6">
                {multi && (
                    <div className="mb-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-dim" data-testid="form-step">
                            Step {step + 1} of {screens.length}
                        </p>
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ground" aria-hidden>
                            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${((step + 1) / screens.length) * 100}%` }} />
                        </div>
                    </div>
                )}
                <h3 id={`form-${form.key}-title`} className="text-xl font-semibold leading-7 text-ink">
                    {screen.title ?? (multi ? `Step ${step + 1}` : form.title)}
                </h3>
                {(screen.description ?? (!multi ? form.description : null)) && <p className="mt-1 text-sm leading-5 text-dim">{screen.description ?? form.description}</p>}
            </div>

            <div className="grid gap-5">
                {shown.map((field) => (
                    <FormFieldInput key={field.id} field={field} value={answers[field.id]} onChange={(value) => answer(field.id, value)} error={errors[field.id] ?? null} disabled={busy} />
                ))}
                {shown.length === 0 && <p className="text-sm text-dim">Nothing to answer on this step.</p>}
            </div>

            {last && (
                <div className="mt-6 border-t border-line pt-5">
                    <TickRow
                        id={`form-${form.key}-consent`}
                        label={definition.consentText}
                        checked={consent}
                        onChange={(next) => {
                            setConsent(next);
                            if (next) setConsentError(null);
                        }}
                        disabled={busy}
                        error={consentError}
                    />
                    {consentError && (
                        <p id={`form-${form.key}-consent-error`} role="alert" className="mt-1.5 text-xs leading-4 text-danger">
                            {consentError}
                        </p>
                    )}
                </div>
            )}

            {failure && (
                <p role="alert" className="mt-5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                    {failure}
                </p>
            )}

            <div className={cn("mt-6 flex flex-wrap items-center gap-3", multi && step > 0 ? "justify-between" : "justify-end")}>
                {multi && step > 0 && (
                    <button type="button" onClick={() => goTo(step - 1)} disabled={busy} className={SECONDARY}>
                        Back
                    </button>
                )}
                <button type="submit" disabled={busy} className={PRIMARY}>
                    {busy ? "Sending…" : last ? (definition.submitLabel ?? "Send") : "Continue"}
                </button>
            </div>
        </form>
    );
}
