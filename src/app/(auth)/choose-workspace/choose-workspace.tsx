"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, ChevronRight, Map as MapIcon, Printer } from "lucide-react";
import { AuthCard, AuthTitle, primaryButton } from "@/components/auth/auth-card";
import { Markdown } from "@/components/platform/markdown";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { messageOf } from "@/lib/api-client";
import { FLAG_PRINT_FLOOR, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { owesBasics, safeNext, type SessionUser } from "@/services/auth";
import { cleanTitle, effectiveLine, legalService, withoutLeadingTitle, type LegalDocument, type LegalKind } from "@/services/legal";
import { basicsFrom, basicsReady, businessNameFrom, dateOfBirthProblem, GENDER_OPTIONS, HOME_OF, isoToday, isoYearsAgo, ORDER_AGE_HINT, signupService, type AccountType, type Basics, type Gender, type Party } from "@/services/party";

const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
    { value: "INDIVIDUAL", label: "Individual", hint: "In your own name" },
    { value: "BUSINESS", label: "Business", hint: "A registered firm or company" },
    { value: "ORGANISATION", label: "Organisation", hint: "A trust, society or institution" },
];

/** The two documents agreed before anything else (QR-6), and what to call them while they load. */
const CONSENT_KINDS: { kind: LegalKind; fallback: string }[] = [
    { kind: "TERMS_OF_SERVICE", fallback: "Terms of service" },
    { kind: "PRIVACY_POLICY", fallback: "Privacy policy" },
];

type Step = "loading" | "consent" | "side" | "basics";

/**
 * The first questions after the first code, in the apps' order (App.tsx):
 *
 * 1. QR-6 — the terms of service and the privacy policy, read and agreed
 *    before any detail is asked (`POST /users/me/consent`, which stamps the
 *    versions live at that moment). Once per account.
 * 2. The side — advertiser or publisher, with the kind of account and its
 *    name (`POST /users/me/party`); PP-1's "I print and install" goes to the
 *    print partner's application instead.
 * 3. QR-22 — the basics once the side exists: the two names, and the date
 *    of birth and the gender if they like (`PATCH /users/me`). 29 Sep 2026
 *    (the owner): anyone may use ADX; 18 or over is asked only to order, so
 *    the date of birth never holds the step up.
 *
 * Never twice (28 Sep 2026, the owner): an individual is not asked a name
 * on the side form — the basics ask it next, split into the two names the
 * ID needs — and a business name the account already gave its other side
 * is offered again. The basics open with whatever the account holds (the
 * names, else the display name, else the name an individual's side row
 * carries), so an account that answered the side before QR-22 is asked
 * only what is missing.
 *
 * The email was proved before this page (ED-1), so it is not asked again.
 * Visited on purpose by an account that has done all three, it is the side
 * chooser it always was.
 */
export function ChooseWorkspace() {
    const router = useRouter();
    const params = useSearchParams();
    const wanted = params.get("party");
    const next = safeNext(params.get("next"));
    const { status, user, parties, needsEmail, chooseParty, setPreferredParty, refresh } = useAuth();
    const [party, setParty] = React.useState<Party | null>(wanted === "PUBLISHER" || wanted === "ADVERTISER" ? wanted : null);
    const [basicsFor, setBasicsFor] = React.useState<Party | null>(null);
    const [accountType, setAccountType] = React.useState<AccountType>("BUSINESS");
    /** The business name as typed; `null` until typed, when the one the account already gave its other side stands. */
    const [name, setName] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    // The print partner's floor is behind partners.print-floor: while it is switched off, its door is not offered.
    const printFloorOff = useSwitchedOff(FLAG_PRINT_FLOOR);

    React.useEffect(() => {
        const here = `/choose-workspace${params.toString() ? `?${params.toString()}` : ""}`;
        if (status === "signed-out") router.replace(`/sign-in?next=${encodeURIComponent(here)}`);
        else if (status === "signed-in" && needsEmail) router.replace(`/verify-email?next=${encodeURIComponent(here)}`);
    }, [status, needsEmail, params, router]);

    const destination = React.useCallback((side: Party) => next ?? HOME_OF[side], [next]);

    /** Where to go once a side is open: the basics when they are still owed, else the workspace. */
    const settle = React.useCallback(
        (side: Party, me: SessionUser | null) => {
            if (side !== "PRINT_PARTNER") setPreferredParty(side);
            if (me && owesBasics(me) && side !== "PRINT_PARTNER") {
                setBasicsFor(side);
                return;
            }
            router.replace(destination(side));
        },
        [destination, router, setPreferredParty]
    );

    /* Sent here by the sign-in because the basics are owed (and nothing else): straight to them. */
    const sideHeld = parties.find((p) => p !== "PRINT_PARTNER") ?? null;
    const owedBasics = !wanted && user && user.consentAcceptedAt !== null && owesBasics(user) ? sideHeld : null;
    const basicsSide = basicsFor ?? owedBasics;

    const step: Step = status !== "signed-in" || !user || needsEmail ? "loading" : user.consentAcceptedAt === null ? "consent" : basicsSide ? "basics" : "side";

    const suggestedName = user ? businessNameFrom(user) : "";
    const businessName = name ?? suggestedName;

    const open = (side: Party) => {
        setError(null);
        if (side === "PRINT_PARTNER") {
            router.push(parties.includes("PRINT_PARTNER") ? "/partner" : "/partner/apply");
            return;
        }
        if (parties.includes(side)) {
            /* The side already exists on this account: on to it (or to the basics it still owes). */
            settle(side, user);
            return;
        }
        setParty(side);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!party || busy) return;
        setBusy(true);
        setError(null);
        try {
            // An individual's side is named after the person — the server takes the account's name, or the basics give it next.
            const typed = accountType === "INDIVIDUAL" ? "" : businessName.trim();
            await chooseParty({ party, accountType, ...(typed ? { name: typed } : {}) });
            settle(party, await refresh());
        } catch (caught) {
            setError(messageOf(caught, "Could not open the workspace. Try again."));
        } finally {
            setBusy(false);
        }
    };

    /**
     * Consent recorded: on to the side, or — for an account that already has
     * one — past it. A print partner sent here by its workspace (which asks
     * for the consent too, never the basics) goes back to the page it came from.
     */
    const consented = async () => {
        const me = await refresh();
        if (!me || wanted) return;
        const held = (["ADVERTISER", "PUBLISHER"] as Party[]).find((side) => me.roles.includes(side));
        if (held) settle(held, me);
        else if (next && me.roles.includes("PARTNER")) router.replace(next);
    };

    if (step === "loading") {
        return (
            <AuthCard>
                <p className="text-sm text-dim">Checking your session…</p>
            </AuthCard>
        );
    }
    if (step === "consent") return <ConsentStep onDone={consented} />;
    if (step === "basics" && basicsSide) {
        return (
            <BasicsStep
                displayId={user?.displayId ?? null}
                initial={user ? basicsFrom(user) : null}
                onDone={async () => {
                    await refresh();
                    router.replace(destination(basicsSide));
                }}
            />
        );
    }

    return (
        <AuthCard>
            <AuthTitle title="Choose your workspace" subtitle="Your account is verified. Where would you like to start?" />
            <div className="mt-8 grid grid-cols-2 gap-3">
                <SideButton icon={<ArrowUpDown className="size-[18px]" aria-hidden />} label="Advertiser" active={party === "ADVERTISER"} held={parties.includes("ADVERTISER")} onClick={() => open("ADVERTISER")} />
                <SideButton icon={<MapIcon className="size-[18px]" aria-hidden />} label="Publisher" active={party === "PUBLISHER"} held={parties.includes("PUBLISHER")} onClick={() => open("PUBLISHER")} />
            </div>

            {party && !parties.includes(party) && (
                <form onSubmit={submit} className="mt-6 border-t border-line pt-6">
                    <p className="text-sm font-semibold text-ink">{party === "PUBLISHER" ? "Who owns the spaces?" : "Who is advertising?"}</p>
                    <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Kind of account">
                        {ACCOUNT_TYPES.map((option) => (
                            <label key={option.value} className={cn("flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3", accountType === option.value ? "border-ink" : "border-line")}>
                                <input type="radio" name="accountType" value={option.value} checked={accountType === option.value} onChange={() => setAccountType(option.value)} className="accent-brand" />
                                <span className="text-sm font-medium text-ink">{option.label}</span>
                                <span className="ml-auto text-xs text-dim">{option.hint}</span>
                            </label>
                        ))}
                    </div>
                    {accountType === "INDIVIDUAL" ? (
                        <p className="mt-4 text-sm text-dim" data-testid="individual-name-note">
                            {user?.name ? `In your own name — ${user.name}.` : "In your own name — you give it on the next step."}
                        </p>
                    ) : (
                        <label className="mt-4 block text-sm">
                            <span className="font-medium text-ink">Business name</span>
                            <input value={businessName} onChange={(event) => setName(event.target.value)} placeholder="As registered" className="mt-1.5 h-12 w-full rounded-md border border-line px-4 text-sm text-ink focus:border-ink focus:outline-none" />
                        </label>
                    )}
                    {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
                    <button type="submit" disabled={busy} className={`${primaryButton} mt-5`}>
                        {busy ? "Opening…" : party === "PUBLISHER" ? "Open publisher workspace" : "Open advertiser workspace"}
                    </button>
                </form>
            )}
            {error && !(party && !parties.includes(party)) && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

            {/* PP-1: the print shop applies; ADX reviews and switches the account on. */}
            {!printFloorOff && <button type="button" onClick={() => open("PRINT_PARTNER")} className="mt-5 flex w-full items-center gap-3 rounded-md border border-line bg-white px-6 py-3.5 text-left hover:border-ink" data-testid="choose-print-partner">
                <Printer className="size-[18px] shrink-0 text-ink" aria-hidden />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{parties.includes("PRINT_PARTNER") ? "Print partner" : "I print and install"}</span>
                    <span className="block text-xs text-dim">{parties.includes("PRINT_PARTNER") ? "Open your print partner workspace" : "Print ADX jobs for spaces near you — apply, and ADX brings you on"}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
            </button>}

            <p className="mt-5 text-xs text-dim">One ADX account for your advertising and publishing work.</p>
        </AuthCard>
    );
}

function SideButton({ icon, label, active, held, onClick }: { icon: React.ReactNode; label: string; active: boolean; held: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn("flex h-[60px] items-center gap-3 rounded-md border bg-white px-6 text-left text-sm font-semibold text-ink hover:border-ink", active ? "border-ink" : "border-line")}
        >
            {icon}
            {label}
            {held && <span className="ml-auto text-xs font-normal text-dim">Open</span>}
        </button>
    );
}

/* ------------------------------------------------------------------ */
/* QR-6 — the terms, agreed and recorded                               */
/* ------------------------------------------------------------------ */

function ConsentStep({ onDone }: { onDone: () => Promise<void> }) {
    const { signOut } = useAuth();
    const [documents, setDocuments] = React.useState<Partial<Record<LegalKind, LegalDocument>>>({});
    const [failed, setFailed] = React.useState(false);
    const [reading, setReading] = React.useState<LegalKind | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let live = true;
        for (const { kind } of CONSENT_KINDS) {
            legalService
                .document(kind)
                .then((document) => {
                    if (live) setDocuments((current) => ({ ...current, [kind]: document }));
                })
                .catch(() => {
                    if (live) setFailed(true);
                });
        }
        return () => {
            live = false;
        };
    }, []);

    const agree = async () => {
        setBusy(true);
        setError(null);
        try {
            await signupService.consent();
            await onDone();
        } catch (caught) {
            setError(messageOf(caught, "Could not record your agreement. Try again."));
        } finally {
            setBusy(false);
        }
    };

    const open = reading ? documents[reading] : undefined;

    return (
        <AuthCard>
            <AuthTitle title="Before we start" subtitle="Two short documents to agree to — how ADX works, and what it does with your data." />
            <div className="mt-8 grid gap-3">
                {CONSENT_KINDS.map(({ kind, fallback }) => {
                    const document = documents[kind];
                    return (
                        <button key={kind} type="button" onClick={() => setReading(kind)} className="flex items-center gap-3 rounded-md border border-line bg-white px-5 py-4 text-left hover:border-ink" data-testid={`consent-read-${kind}`}>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-ink">{document ? cleanTitle(document.title) : fallback}</span>
                                <span className="mt-0.5 block text-xs text-dim">{document ? (document.summary ?? document.blurb) : failed ? "Could not load — you can still read it on its page." : "Loading…"}</span>
                                {document && <span className="mt-1 block text-xs text-dim">Version {document.version}</span>}
                            </span>
                            <span className="text-sm font-medium text-ink">Read</span>
                        </button>
                    );
                })}
            </div>
            {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
            <p className="mt-6 text-xs text-dim">By selecting I agree, you accept the ADX Terms of service and Privacy policy in the versions shown. ADX records the date and the versions you agreed to.</p>
            <button type="button" onClick={() => void agree()} disabled={busy} className={`${primaryButton} mt-4`} data-testid="consent-agree">
                {busy ? "Recording…" : "I agree"}
            </button>
            <button type="button" onClick={() => void signOut()} className="mt-3 text-sm text-dim underline-offset-2 hover:text-ink hover:underline">
                Not now — sign out
            </button>

            <Dialog open={!!reading} onOpenChange={(value) => !value && setReading(null)}>
                <DialogContent className="max-h-[85vh] max-w-[720px] overflow-y-auto border-line bg-white">
                    <DialogTitle className="pr-6 text-xl font-semibold text-ink">{open ? cleanTitle(open.title) : (CONSENT_KINDS.find((k) => k.kind === reading)?.fallback ?? "")}</DialogTitle>
                    {open ? (
                        <>
                            <p className="text-xs text-dim">{effectiveLine(open.effectiveFrom, open.version)}</p>
                            <Markdown source={withoutLeadingTitle(open.body, open.title)} className="text-[15px]" />
                            <Link href={`/legal/${open.kind}`} target="_blank" className="text-sm font-medium text-ink underline underline-offset-2">
                                Open on its own page
                            </Link>
                        </>
                    ) : (
                        <p className="text-sm text-dim">{failed ? "This document could not be loaded. Try again in a moment." : "Loading…"}</p>
                    )}
                </DialogContent>
            </Dialog>
        </AuthCard>
    );
}

/* ------------------------------------------------------------------ */
/* QR-22 — the basics                                                  */
/* ------------------------------------------------------------------ */

const field = "mt-1.5 h-12 w-full rounded-md border border-line bg-white px-4 text-sm text-ink focus:border-ink focus:outline-none";

function BasicsStep({ displayId, initial, onDone }: { displayId: string | null; initial: Basics | null; onDone: () => Promise<void> }) {
    /* Opens with what the account already holds (`basicsFrom`); only what is missing is left to type. */
    const [basics, setBasics] = React.useState<Basics>(() => initial ?? { firstName: "", lastName: "", dateOfBirth: "", gender: "" });
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const dobProblem = basics.dateOfBirth ? dateOfBirthProblem(basics.dateOfBirth) : null;
    const ready = basicsReady(basics);
    const set = (patch: Partial<Basics>) => setBasics((current) => ({ ...current, ...patch }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            await signupService.basics(basics);
            await onDone();
        } catch (caught) {
            setError(messageOf(caught, "Could not save your details. Try again."));
            setBusy(false);
        }
    };

    return (
        <AuthCard>
            <AuthTitle title="Tell us about yourself" subtitle="Your name, as it appears on your identity documents." />
            <form onSubmit={submit} className="mt-8">
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                        <span className="font-medium text-ink">First name</span>
                        <input value={basics.firstName} onChange={(event) => set({ firstName: event.target.value })} placeholder="Asha" autoComplete="given-name" maxLength={60} className={field} autoFocus />
                    </label>
                    <label className="block text-sm">
                        <span className="font-medium text-ink">Last name</span>
                        <input value={basics.lastName} onChange={(event) => set({ lastName: event.target.value })} placeholder="Rao" autoComplete="family-name" maxLength={60} className={field} />
                    </label>
                    <label className="block text-sm">
                        <span className="font-medium text-ink">
                            Date of birth <span className="font-normal text-dim">(optional)</span>
                        </span>
                        <input type="date" value={basics.dateOfBirth} onChange={(event) => set({ dateOfBirth: event.target.value })} max={isoToday()} min={isoYearsAgo(120)} autoComplete="bday" className={field} />
                    </label>
                    <label className="block text-sm">
                        <span className="font-medium text-ink">
                            Gender <span className="font-normal text-dim">(optional)</span>
                        </span>
                        <select value={basics.gender ?? ""} onChange={(event) => set({ gender: event.target.value as Gender | "" })} className={field}>
                            <option value="">Choose…</option>
                            {GENDER_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                {/* Form symmetry: the one line under the whole row, never under the date alone. Under 18 is no problem here — only an order asks. */}
                <p className={cn("mt-2 text-xs", dobProblem ? "text-danger" : "text-dim")}>{dobProblem ?? ORDER_AGE_HINT}</p>
                {displayId && (
                    <div className="mt-6 rounded-md bg-ground px-4 py-3">
                        <p className="text-xs text-dim">Your ADX ID</p>
                        <p className="text-base font-semibold tracking-wide text-brand-bright">{displayId}</p>
                        <p className="text-xs text-dim">Quote it to ADX support any time. It is yours from today.</p>
                    </div>
                )}
                {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
                <button type="submit" disabled={!ready || busy} className={`${primaryButton} mt-6`}>
                    {busy ? "Saving…" : "Continue"}
                </button>
            </form>
        </AuthCard>
    );
}
