"use client";

import * as React from "react";
import { ageRefusalOf, messageOf, type AgeRefusal } from "@/lib/api-client";
import { useOptionalAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { btnPrimary, inputClass } from "@/components/advertiser/bits";
import { accountService } from "@/services/account";
import type { SessionUser } from "@/services/auth";
import { birthDateOf, dateOfBirthProblem, isAdult, isoToday, isoYearsAgo, ORDER_AGE_HINT } from "@/services/party";

/**
 * The order age gate (29 Sep 2026, the owner: "You don't need to be over 18
 * to use ADX, but you do need to be over 18 to place orders"). Built once,
 * used on every screen that places an order — a campaign's checkout and its
 * reservation fee, a design quote accepted, a plan bought, paid or set to
 * auto-renew, a display ad, a sponsored listing.
 *
 * - Before an order is sent: no date of birth on file (the session's read
 *   of `GET /users/me`) → the field is asked right there and the order waits;
 *   saving it (`PATCH /users/me`) re-reads the session and sends the order.
 *   A date on file that is under 18 → one plain line, and the pay buttons wait
 *   (`blocked`).
 * - When an order door answers 403 `AGE_REQUIRED` anyway: `MISSING` for the
 *   person themselves → the same field, then the same order again; `UNDER_18`
 *   → the same plain line; for someone acting on another's account
 *   (`self: false`) → the server's own sentence.
 *
 * A screen asks `gate.ready(retry)` before it sends, `gate.caught(error,
 * retry)` in its catch, draws `<AgeGate gate={gate} />` beside its pay
 * button, and disables that button while `gate.blocked`.
 */

/** What the gate says when the person ordering is under 18. */
export const UNDER_18_LINE = "You need to be 18 or over to place an order.";

export type AgeGateView = { kind: "clear" } | { kind: "ask" } | { kind: "under-18" } | { kind: "refused"; message: string };

export interface AgeGate {
    view: AgeGateView;
    /** The pay buttons wait while this is true: the person ordering is under 18. */
    blocked: boolean;
    /** An order is waiting on the date of birth, and goes as soon as it is saved. */
    waiting: boolean;
    /** Before an order is sent: true when it may go; else the gate shows why, and `retry` runs once the date is saved. */
    ready: (retry: () => void) => boolean;
    /** In an order's catch: true when the failure was `AGE_REQUIRED` and the gate has taken it over. */
    caught: (error: unknown, retry: () => void) => boolean;
    /** Saves the date of birth (`PATCH /users/me`), re-reads the session, and sends the waiting order when the date is 18 or over. */
    save: (iso: string) => Promise<void>;
}

/**
 * The date of birth the session holds, as YYYY-MM-DD; null when none is on
 * file; undefined when it is not known (no session read, or a read without
 * the field) — the server then decides.
 */
export function birthDateOnFile(user: Pick<SessionUser, "dateOfBirth"> | null | undefined): string | null | undefined {
    if (!user || user.dateOfBirth === undefined) return undefined;
    return birthDateOf(user.dateOfBirth) || null;
}

type Known = { session: string | null | undefined; saved: string | null };

/**
 * One gate per screen. `upfront: false` keeps the under-18 line back until
 * an order is tried — for a switch (auto-renew) that is also turned off from
 * the same place, where the line would otherwise stand over a plan already
 * running.
 */
export function useAgeGate({ upfront = true }: { upfront?: boolean } = {}): AgeGate {
    const auth = useOptionalAuth();
    const session = birthDateOnFile(auth?.user);
    const refresh = auth?.refresh;
    const [saved, setSaved] = React.useState<string | null>(null);
    const [asking, setAsking] = React.useState(false);
    const [tried, setTried] = React.useState(false);
    const [waiting, setWaiting] = React.useState(false);
    const [refusal, setRefusal] = React.useState<AgeRefusal | null>(null);
    /* `ready` and `caught` read these, not the render's values: the retry after a save runs a closure an earlier render made. */
    const known = React.useRef<Known>({ session, saved: null });
    const retry = React.useRef<(() => void) | null>(null);

    React.useEffect(() => {
        known.current.session = session;
    }, [session]);

    const ready = React.useCallback((again: () => void): boolean => {
        const onFile = known.current.saved ?? known.current.session;
        if (typeof onFile === "string" && !isAdult(onFile)) {
            setTried(true);
            return false;
        }
        if (onFile === null) {
            retry.current = again;
            setWaiting(true);
            setAsking(true);
            return false;
        }
        setRefusal(null);
        return true;
    }, []);

    const caught = React.useCallback((error: unknown, again: () => void): boolean => {
        const found = ageRefusalOf(error);
        if (!found) return false;
        setTried(true);
        if (found.self && found.reason === "MISSING") {
            retry.current = again;
            setWaiting(true);
            setAsking(true);
            setRefusal(null);
            return true;
        }
        setRefusal(found);
        return true;
    }, []);

    const save = React.useCallback(
        async (iso: string) => {
            await accountService.updateProfile({ dateOfBirth: iso });
            known.current.saved = iso;
            setSaved(iso);
            setAsking(false);
            setWaiting(false);
            setRefusal(null);
            const again = retry.current;
            retry.current = null;
            if (refresh) await refresh();
            if (isAdult(iso)) again?.();
            else setTried(true);
        },
        [refresh]
    );

    const onFile = saved ?? session;
    const under18 = typeof onFile === "string" && !isAdult(onFile);
    const view: AgeGateView =
        refusal && !refusal.self
            ? { kind: "refused", message: refusal.message }
            : refusal?.reason === "UNDER_18" || (under18 && (upfront || tried))
              ? { kind: "under-18" }
              : asking
                ? { kind: "ask" }
                : { kind: "clear" };

    return { view, blocked: view.kind === "under-18", waiting, ready, caught, save };
}

/** What the gate draws beside the pay button: nothing, the date of birth to add, the under-18 line, or the server's sentence. */
export function AgeGate({ gate, className }: { gate: AgeGate; className?: string }) {
    const { view } = gate;
    if (view.kind === "clear") return null;
    if (view.kind === "refused") {
        return (
            <p role="alert" className={cn("rounded-md bg-danger-soft px-3 py-2 text-sm text-danger", className)} data-testid="age-gate">
                {view.message}
            </p>
        );
    }
    if (view.kind === "under-18") {
        return (
            <p role="status" className={cn("rounded-md bg-warning-soft px-3 py-2 text-sm text-warning", className)} data-testid="age-gate">
                {UNDER_18_LINE}
            </p>
        );
    }
    return <AddBirthDate gate={gate} className={className} />;
}

/** The one field an order asks for: the date and its button on one row, the rule on one line under the whole row (form symmetry). */
function AddBirthDate({ gate, className }: { gate: AgeGate; className?: string }) {
    const id = React.useId();
    const input = React.useRef<HTMLInputElement>(null);
    const [value, setValue] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /* Asked because an order was tried: bring the field to the person, wherever on the page they pressed. */
    React.useEffect(() => {
        input.current?.focus();
    }, []);

    const submit = async () => {
        if (busy) return;
        const problem = dateOfBirthProblem(value);
        if (problem) {
            setError(problem);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await gate.save(value);
        } catch (caught) {
            setError(messageOf(caught, "Could not save your date of birth. Try again."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={cn("rounded-md border border-line bg-white px-4 py-4", className)} data-testid="age-gate">
            <p className="text-sm font-semibold text-ink">Add your date of birth</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
                <label htmlFor={id} className="block min-w-0 flex-1 basis-48 text-sm">
                    <span className="font-medium text-ink">Date of birth</span>
                    <input
                        ref={input}
                        id={id}
                        type="date"
                        value={value}
                        onChange={(event) => {
                            setValue(event.target.value);
                            setError(null);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                void submit();
                            }
                        }}
                        max={isoToday()}
                        min={isoYearsAgo(120)}
                        autoComplete="bday"
                        aria-invalid={!!error}
                        className={cn(inputClass, "mt-1.5")}
                    />
                </label>
                <button type="button" onClick={() => void submit()} disabled={busy || !value} className={btnPrimary}>
                    {busy ? "Saving…" : gate.waiting ? "Save and continue" : "Save"}
                </button>
            </div>
            <p role={error ? "alert" : undefined} className={cn("mt-2 text-xs", error ? "text-danger" : "text-dim")}>
                {error ?? ORDER_AGE_HINT}
            </p>
        </div>
    );
}
