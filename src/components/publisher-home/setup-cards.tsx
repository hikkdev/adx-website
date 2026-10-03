"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Flag, Lock, PenLine, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { outlineButton, brandButton } from "@/components/publisher/parts";
import { AgreementGate } from "@/components/listing-form/agreement-gate";
import type { PublisherReadiness, SigningSlice } from "@/services/publisher-workspace";
import { activeSuspensions, licenceState, offersContinueUnverified, readinessAction, readinessSteps, signHref, SUSPENSION_BANNERS, type DrawnScope } from "./home-model";

const SCOPE_ICON: Record<DrawnScope, React.ComponentType<{ className?: string }>> = {
    BLOCK_NEW: AlertTriangle,
    STOP_OPEN_WORK: XCircle,
    STOP_ACCRUAL: Clock,
    FREEZE_WALLET: Lock,
};

/**
 * Lot A: one banner per suspended section, the reason under it, and
 * "Contact ADX support" as the only way out — a suspension is not a nudge,
 * so nothing here dismisses. Nothing draws when there is none.
 */
export function SuspensionBanners({ scopes, reason }: { scopes: readonly string[] | null | undefined; reason: string | null | undefined }) {
    const active = activeSuspensions(scopes);
    if (active.length === 0) return null;
    const why = (reason ?? "").trim();
    return (
        <div className="space-y-2" data-testid="suspension-banners">
            {active.map((scope) => {
                const banner = SUSPENSION_BANNERS[scope];
                const Icon = SCOPE_ICON[scope];
                return (
                    <div key={scope} role="alert" className={cn("flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3", banner.tone === "danger" ? "border-danger/25 bg-danger-soft" : "border-warning/25 bg-warning-soft")}>
                        <Icon className={cn("mt-0.5 size-4 shrink-0", banner.tone === "danger" ? "text-danger" : "text-warning")} />
                        <div className="min-w-0 flex-1">
                            <p className={cn("text-sm font-semibold", banner.tone === "danger" ? "text-danger" : "text-warning")}>{banner.title}</p>
                            <p className="mt-0.5 text-sm text-ink">{why || "ADX has paused this part of your account."}</p>
                        </div>
                        <Link href="/publisher/help/new" className="text-sm font-semibold text-ink underline underline-offset-4 decoration-line hover:decoration-ink">
                            Contact ADX support
                        </Link>
                    </div>
                );
            })}
        </div>
    );
}

/** DS-3: the licence to display — asked for at the first approved listing; the next batch waits on it. */
export function LicenceCard({ licence }: { licence: SigningSlice | null | undefined }) {
    const state = licenceState(licence);
    if (state === "NONE") return null;
    return (
        <Card icon={<PenLine className="size-4" aria-hidden />} title="Sign your licence to display">
            <p className="text-sm text-dim">
                {state === "SIGN"
                    ? "One signature covers every space you list, now and later — Aadhaar OTP, about a minute. Your next batch of listings goes live once it is signed."
                    : "The signing link ran out; ADX sends a fresh one with your next listing, or from the desk."}
            </p>
            {state === "SIGN" && licence?.requestId && (
                <Link href={signHref(licence.requestId)} className={cn(brandButton, "mt-4")}>
                    Sign the licence
                </Link>
            )}
        </Card>
    );
}

/**
 * The set-up checklist (DR 12 · 03 · 05, 5204:62068) with the server's own
 * readiness (QR-3): one figure, the details and the identity check as the
 * app's card lists them, then the first listing and the payout account the
 * website's frame adds. "Continue unverified" puts it away for this visit
 * once only the check is left — an unverified publisher lists and goes live,
 * marked unverified.
 */
export function SetupCard({
    readiness,
    kycStatus,
    listings,
    methods,
    onContinueUnverified,
}: {
    readiness: PublisherReadiness | null | undefined;
    kycStatus: string | undefined;
    listings: number;
    methods: number;
    onContinueUnverified: () => void;
}) {
    const steps: { key: string; title: string; text: string; done: boolean; note?: string; action?: { label: string; href: string } }[] = [];
    if (readiness) {
        const action = readinessAction(readiness);
        for (const step of readinessSteps(readiness)) {
            steps.push({
                key: step.key,
                title: step.label,
                text: step.detail,
                done: step.done,
                note: step.done ? (step.key === "kyc" ? "Verified" : "Done") : step.key === "kyc" && (kycStatus === "PENDING" || kycStatus === "IN_REVIEW") ? "In review" : step.key === "kyc" ? "Optional" : undefined,
                action: step.done
                    ? step.key === "kyc"
                        ? { label: "View verification", href: "/publisher/profile/verify" }
                        : undefined
                    : step.key === "profile"
                      ? (action ?? { label: "Complete your details", href: "/publisher/profile" })
                      : { label: kycStatus === "PENDING" ? "See verification status" : "Verify your identity", href: "/publisher/profile/verify" },
            });
        }
    } else {
        const verified = kycStatus === "VERIFIED";
        steps.push({ key: "kyc", title: "Add and verify your business", text: "Provide business and contact details, then submit supporting documents.", done: verified, note: verified ? "Verified" : undefined, action: { label: verified ? "View business profile" : "Start business setup", href: verified ? "/publisher/profile" : "/publisher/profile/verify" } });
    }
    steps.push({ key: "listing", title: "Create your first listing", text: "Add a space, set your price and availability, and submit it for review.", done: listings > 0, note: listings > 0 ? `${listings} listing${listings === 1 ? "" : "s"}` : undefined, action: { label: listings > 0 ? "Open my inventory" : "Add an ad space", href: listings > 0 ? "/publisher/inventory" : "/publisher/listings/new" } });
    steps.push({ key: "payout", title: "Set up your payout account", text: "Add the bank account where you want to receive your earnings.", done: methods > 0, note: methods > 0 ? "Added" : undefined, action: { label: methods > 0 ? "View bank details" : "Add bank details", href: "/publisher/earnings/bank" } });

    const percent = readiness?.percent ?? null;
    return (
        <section className="rounded-lg border border-line bg-white p-6" data-testid="setup-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-base font-semibold text-ink">Finish setting up your workspace</h2>
                    <p className="mt-1 text-sm text-dim">You can prepare a listing while your business information is reviewed. Verified profiles and their spaces are shown first to advertisers.</p>
                </div>
                {percent !== null && (
                    <div className="min-w-[160px]">
                        <p className="text-right text-sm font-semibold tabular-nums text-ink">{percent}% set up</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ground" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Account set-up">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                        </div>
                    </div>
                )}
            </div>
            <ol className="mt-5 space-y-3">
                {steps.map((step, index) => (
                    <li key={step.key} className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-ground px-5 py-4">
                        <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                                {step.done ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <span className="text-dim">{index + 1}.</span>}
                                {step.title}
                                {step.note && <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", step.done ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{step.note}</span>}
                            </p>
                            <p className="mt-1 text-sm text-dim">{step.text}</p>
                        </div>
                        {step.action && (
                            <Link href={step.action.href} className={outlineButton}>
                                {step.action.label}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
            {readiness && offersContinueUnverified(readiness) && (
                <div className="mt-4 flex justify-end">
                    <button type="button" onClick={onContinueUnverified} className="text-sm font-semibold text-ink underline underline-offset-4 decoration-line hover:decoration-ink">
                        Continue unverified
                    </button>
                </div>
            )}
        </section>
    );
}

/** Lot D (Q42): the desk flagged some documents and asked for exactly those again. */
export function ReuploadCard() {
    return (
        <Card icon={<Flag className="size-4 text-danger" aria-hidden />} title="Needs a re-upload">
            <p className="text-sm text-dim">ADX could not accept some of your documents. Send the flagged ones again — everything else is kept, and the review picks up where it left off.</p>
            <Link href="/publisher/profile/verify" className={cn(brandButton, "mt-4")}>
                Re-upload the flagged documents
            </Link>
        </Card>
    );
}

/** U8/QR-22: the platform terms, read and accepted here — the same record the submit's agreement step makes. */
export function TermsCard({ onAccepted }: { onAccepted: () => void }) {
    const [open, setOpen] = React.useState(false);
    return (
        <Card icon={<PenLine className="size-4" aria-hidden />} title="Platform terms">
            <p className="text-sm text-dim">Read and accept the ADX publisher terms. Your listings are sent for review once they are accepted — you can do it now rather than at your first submit.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setOpen(true)} className={brandButton}>
                    Read the terms
                </button>
                <Link href="/publisher/agreements" className="text-sm font-medium text-ink underline underline-offset-4 decoration-line hover:decoration-ink">
                    My agreements
                </Link>
            </div>
            {open && (
                <AgreementGate
                    intro="Read the ADX publisher agreement to the end, then accept it. It covers every space you list."
                    onAccepted={() => {
                        setOpen(false);
                        onAccepted();
                    }}
                    onClose={() => setOpen(false)}
                />
            )}
        </Card>
    );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-line bg-white p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                {icon}
                {title}
            </h2>
            <div className="mt-2">{children}</div>
        </section>
    );
}
