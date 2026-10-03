"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, Loading, outlineButton } from "@/components/publisher/parts";
import { usePartnerAccount } from "@/components/partner/partner-context";
import { FLAG_PARTNER_KYC, useSwitchedOff } from "@/lib/flags";
import { cn } from "@/lib/utils";
import { openBlob, type Tone } from "@/services/publisher-workspace";
import { isApplicant, isPrivatePath, kycBanner, partnerMessage, partnerService, signHref, signingOpen, signingPending, specRows, type LadderStep, type PartnerProfile } from "@/services/partner";

/**
 * The pieces the print partner's pages share — composed from the publisher
 * workspace's parts so the floor looks like it was always there.
 */

const NOTE_TONE: Record<Tone, string> = {
    success: "border-success/20 bg-success-soft text-success",
    warning: "border-warning/20 bg-warning-soft text-warning",
    danger: "border-danger/20 bg-danger-soft text-danger",
    info: "border-info/20 bg-info-soft text-info",
    neutral: "border-line bg-ground text-dim",
    ink: "border-brand/20 bg-brand-soft text-brand",
};

/** One sentence in its tone's colours — a state the page is in, not an error. */
export function Note({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
    return <div className={cn("rounded-lg border px-4 py-3 text-sm", NOTE_TONE[tone], className)}>{children}</div>;
}

/** The time, ticking once a minute — a countdown that moves while the page is open. */
export function useNow(intervalMs = 60_000): number {
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);
    return now;
}

/**
 * The floor's pages while the shop is an application: the app keeps its
 * tabs shut until ADX switches the account on, and so does the web — the
 * page says why and where the application is.
 */
export function ApplicantGate({ children, what }: { children: React.ReactNode; what: string }) {
    const { partner, loaded } = usePartnerAccount();
    const kycOff = useSwitchedOff(FLAG_PARTNER_KYC);
    /* Wait for the row, so an applicant never sees the floor flash before the gate. */
    if (!loaded) return <Loading label="Loading your shop…" />;
    if (partner && isApplicant(partner)) {
        return (
            <Panel className="mt-6">
                <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                    <div>
                        <p className="text-base font-semibold text-ink">Your shop is under review</p>
                        <p className="mt-1 text-sm text-dim">{what} open here once ADX switches your account on. Meanwhile you can finish your KYC and add your rate card.</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <Link href="/partner/apply" className={brandButton}>
                                See your application
                            </Link>
                            {!kycOff && (
                                <Link href="/partner/verify" className={outlineButton}>
                                    Verification
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </Panel>
        );
    }
    return <>{children}</>;
}

/** The ladder, left to right: a dot per rung, the time under each reached one. */
export function Ladder({ steps }: { steps: LadderStep[] }) {
    return (
        <ol className="grid grid-cols-5 gap-2" aria-label="Where the job is">
            {steps.map((step, index) => (
                <li key={step.key} className="relative min-w-0">
                    {index > 0 && <span aria-hidden className={cn("absolute right-1/2 top-3 h-0.5 w-[calc(100%+0.5rem)] -translate-y-1/2", step.state === "todo" ? "bg-line" : "bg-brand")} />}
                    <div className="flex flex-col items-center text-center">
                        <span
                            aria-hidden
                            className={cn(
                                "relative z-10 flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
                                step.state === "done" && "border-brand bg-brand text-white",
                                step.state === "current" && "border-brand bg-white text-brand",
                                step.state === "todo" && "border-line bg-white text-dim"
                            )}
                        >
                            {step.state === "done" ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <span className={cn("mt-2 text-xs font-medium", step.state === "todo" ? "text-dim" : "text-ink")}>
                            {step.label}
                            <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "current" ? " (now)" : ""}</span>
                        </span>
                        {step.detail && <span className="mt-0.5 text-[11px] leading-4 text-dim">{step.detail}</span>}
                    </div>
                </li>
            ))}
        </ol>
    );
}

/** The specs on a job or a request, as label-and-value rows. */
export function SpecList({ specs }: { specs: Record<string, unknown> | null | undefined }) {
    const rows = specRows(specs);
    if (rows.length === 0) return <p className="text-sm text-dim">No specs attached.</p>;
    return (
        <dl className="divide-y divide-line">
            {rows.map((row) => (
                <div key={row.key} className="flex items-start justify-between gap-6 py-2">
                    <dt className="text-sm text-dim">{row.key}</dt>
                    <dd className="text-right text-sm font-medium text-ink">{row.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * A picture off the backend: a public URL is drawn as it is; a path on
 * private storage (`/files/:id`) is fetched with the session's bearer and
 * drawn from an object URL.
 */
export function PrivateImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
    const isPath = isPrivatePath(src);
    const [objectUrl, setObjectUrl] = React.useState<{ src: string; url: string } | null>(null);

    React.useEffect(() => {
        if (!src || !isPath) return;
        let cancelled = false;
        let made: string | null = null;
        partnerService
            .file(src)
            .then((blob) => {
                if (cancelled) return;
                made = URL.createObjectURL(blob);
                setObjectUrl({ src, url: made });
            })
            .catch(() => {
                /* The frame keeps its placeholder. */
            });
        return () => {
            cancelled = true;
            if (made) URL.revokeObjectURL(made);
        };
    }, [src, isPath]);

    const resolved = !src ? null : isPath ? (objectUrl?.src === src ? objectUrl.url : null) : src;
    if (!resolved) return <div className={cn("bg-ground", className)} role="img" aria-label={alt} />;
    return <img src={resolved} alt={alt} className={className} />;
}

/** Opens a file: a private one through the bearer as a download, a public one in a new tab. */
export async function openFile(url: string, filename: string): Promise<void> {
    if (!isPrivatePath(url)) {
        window.open(url, "_blank", "noopener");
        return;
    }
    try {
        openBlob(await partnerService.file(url), filename);
    } catch (caught) {
        toast.error(partnerMessage(caught, "Could not open the file."));
    }
}

/** The KYC nudge while the shop is not verified — to the Verification page. */
export function KycBannerPanel({ partner, className }: { partner: PartnerProfile; className?: string }) {
    const banner = kycBanner(partner);
    // Verification switched off (`print.partner-kyc`): nothing to send the shop to.
    const kycOff = useSwitchedOff(FLAG_PARTNER_KYC);
    if (!banner || kycOff) return null;
    return (
        <Panel className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
            <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-ink">{banner.title}</p>
                <p className="mt-1 text-sm text-dim">{banner.body}</p>
            </div>
            <Link href="/partner/verify" className={outlineButton}>
                Open verification
            </Link>
        </Panel>
    );
}

/** DS-2: the service agreement, asked for once KYC verifies — quotes and jobs wait on it. */
export function AgreementPanel({ partner, next, className }: { partner: PartnerProfile; next: string; className?: string }) {
    const agreement = partner.agreement;
    if (!signingPending(agreement)) return null;
    const open = signingOpen(agreement.status) && !!agreement.requestId;
    return (
        <Panel className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
            <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-ink">Sign your service agreement</p>
                <p className="mt-1 text-sm text-dim">{open ? "Your KYC is verified. One signature — Aadhaar OTP, about a minute — and you can quote and take print jobs." : "The signing link ran out. ADX sends a fresh one, and quoting and jobs open once it is signed."}</p>
            </div>
            {open && (
                <Link href={signHref(agreement.requestId!, next)} className={brandButton}>
                    Sign the agreement
                </Link>
            )}
        </Panel>
    );
}
