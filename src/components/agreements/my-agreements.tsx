"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, PenLine } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Cell, Chip, DataTable, ErrorNote, Loading, outlineButton, TableRow, TitleCell } from "@/components/publisher/parts";
import { useLoad } from "@/components/publisher/use-load";
import { AgreementAccept } from "@/components/agreements/agreement-accept";
import { AgreementBody } from "@/components/agreements/agreement-text";
import { saveFile } from "@/components/agreements/download";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    agreements,
    dayMonthYear,
    pdfName,
    platformKindOf,
    signingHref,
    signingPending,
    signingStatusOf,
    splitSigning,
    type PlatformStanding,
    type SigningRequest,
    type SigningSlice,
} from "@/services/agreements";

type Side = "PUBLISHER" | "ADVERTISER" | "PRINT_PARTNER";

const BASE: Record<Side, string> = { PUBLISHER: "/publisher", ADVERTISER: "/advertiser", PRINT_PARTNER: "/partner" };

interface Loaded {
    platform: (PlatformStanding & { licence?: SigningSlice | null }) | null;
    platformError: string | null;
    service: SigningSlice | null;
    signing: SigningRequest[];
    signingError: string | null;
}

async function readAll(side: Side): Promise<Loaded> {
    const platformRead = side === "PUBLISHER" ? agreements.publisherStanding() : side === "ADVERTISER" ? agreements.advertiserStanding() : Promise.resolve(null);
    const serviceRead = side === "PRINT_PARTNER" ? agreements.partnerSlice().catch(() => null) : Promise.resolve(null);
    const [platform, service, signing] = await Promise.allSettled([platformRead, serviceRead, agreements.mine()]);
    return {
        platform: platform.status === "fulfilled" ? platform.value : null,
        platformError: platform.status === "rejected" ? messageOf(platform.reason, "Could not read your platform terms.") : null,
        service: service.status === "fulfilled" ? service.value : null,
        signing: signing.status === "fulfilled" ? signing.value : [],
        signingError: signing.status === "rejected" ? messageOf(signing.reason, "Could not read your documents.") : null,
    };
}

/**
 * "Agreements" for each side — the app's `MyAgreementsScreen` (DS-1) with
 * the platform terms beside it: the live version of the side's terms and
 * whether it is accepted (with the Accept door while it is not), every
 * document sent for e-signature waiting on the person, and the signed and
 * past ones with their copies.
 */
export function MyAgreements({ side }: { side: Side }) {
    const { data, error, loading, reload } = useLoad(`agreements-${side}`, () => readAll(side));
    const base = BASE[side];
    const here = `${base}/agreements`;

    return (
        <>
            <PageHeading title="Agreements" subtitle="The terms you work on with ADX, and every document sent to you for signature, with your copy once it is signed." />
            {!data && loading && <Loading label="Reading your agreements…" />}
            {!data && !loading && error && (
                <div className="mt-6">
                    <ErrorNote message={error} onRetry={reload} />
                </div>
            )}
            {data && (
                <>
                    {side !== "PRINT_PARTNER" && <PlatformCard side={side} standing={data.platform} error={data.platformError} onChanged={reload} />}
                    {side === "PRINT_PARTNER" && <ServiceCard slice={data.service} here={here} />}
                    {data.signingError && (
                        <div className="mt-6">
                            <ErrorNote message={data.signingError} onRetry={reload} />
                        </div>
                    )}
                    {!data.signingError && <SigningLists rows={data.signing} here={here} />}
                </>
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* The platform terms                                                  */
/* ------------------------------------------------------------------ */

function PlatformCard({ side, standing, error, onChanged }: { side: "PUBLISHER" | "ADVERTISER"; standing: PlatformStanding | null; error: string | null; onChanged: () => void }) {
    const [dialog, setDialog] = React.useState<null | "read" | "accept">(null);
    const kind = platformKindOf(side)!;
    const text = standing?.current ?? null;

    const chip = !standing
        ? null
        : !text
          ? { tone: "neutral" as const, label: "Not published yet" }
          : standing.pending
            ? { tone: "warning" as const, label: standing.acceptedAt ? "New version to accept" : "To accept" }
            : standing.outdated
              ? { tone: "warning" as const, label: "Newer version live" }
              : { tone: "success" as const, label: "Accepted" };
    const line = !standing
        ? null
        : !text
          ? "ADX has not published these terms yet. You will be asked to accept them once they are live."
          : standing.pending
            ? side === "ADVERTISER"
                ? "Accept the current version before you book. It covers what you buy, what ADX guarantees about a site, and what happens if a site becomes unavailable."
                : "Accept the current version to list and take bookings on ADX."
            : standing.outdated && standing.acceptedAt
              ? `You accepted version ${standing.acceptedVersion ?? "-"} on ${dayMonthYear(standing.acceptedAt)}. Version ${text.version} is now in force and not yet required: accept it when you are ready.`
              : standing.acceptedAt
                ? `You accepted version ${standing.acceptedVersion ?? text.version}, the version in force, on ${dayMonthYear(standing.acceptedAt)}.`
                : `You have accepted version ${text.version}, the version in force.`;

    return (
        <Panel className="mt-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <CardTitle>Platform terms</CardTitle>
                    <p className="mt-1 text-sm text-ink">{text?.title ?? (side === "ADVERTISER" ? "ADX advertiser agreement" : "ADX publisher agreement")}</p>
                    {text && <p className="text-xs text-dim">Version {text.version} · in force today</p>}
                </div>
                {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
            </div>
            {error && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {error}
                </p>
            )}
            {line && <p className="mt-3 text-sm text-dim">{line}</p>}
            {text && (
                <div className="mt-5 flex flex-wrap gap-3">
                    {(standing?.pending || standing?.outdated) && (
                        <button type="button" onClick={() => setDialog("accept")} className={brandButton}>
                            {standing.pending ? "Read and accept" : `Accept version ${text.version}`}
                        </button>
                    )}
                    <button type="button" onClick={() => setDialog("read")} className={outlineButton}>
                        Read the terms
                    </button>
                </div>
            )}

            <Dialog open={dialog !== null} onOpenChange={(value) => !value && setDialog(null)}>
                <DialogContent className="max-w-[720px] gap-0 rounded-lg border-line p-0">
                    <DialogHeader className="px-6 pb-3 pt-6">
                        <DialogTitle className="text-lg font-semibold text-ink">{dialog === "accept" ? "Accept the platform terms" : (text?.title ?? "Platform terms")}</DialogTitle>
                        <DialogDescription className="text-sm text-dim">{dialog === "accept" ? `Read the terms, then accept them to ${side === "ADVERTISER" ? "book" : "list and take bookings"} on ADX.` : text ? `Version ${text.version}, the version in force today.` : ""}</DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pb-6">
                        {dialog === "accept" ? (
                            <AgreementAccept
                                kind={kind}
                                onCancel={() => setDialog(null)}
                                onAccepted={() => {
                                    toast.success("Accepted. Thank you.");
                                    setDialog(null);
                                    onChanged();
                                }}
                            />
                        ) : (
                            text && (
                                <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-line px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-line" tabIndex={0} aria-label="The terms">
                                    <AgreementBody body={text.body} />
                                </div>
                            )
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </Panel>
    );
}

/** The print partner's service agreement (DS-2): e-signed once the shop's KYC verifies; quotes and jobs wait on it. */
function ServiceCard({ slice, here }: { slice: SigningSlice | null; here: string }) {
    if (!slice) return null;
    const pending = signingPending(slice);
    const status = slice.status ? signingStatusOf(slice.status) : null;
    return (
        <Panel className="mt-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <CardTitle>{slice.label ?? "Print partner service agreement"}</CardTitle>
                    <p className="mt-1 text-sm text-dim">
                        {slice.satisfied
                            ? `Signed${slice.completedAt ? ` on ${dayMonthYear(slice.completedAt)}` : ""}. Quote requests and jobs are open to the shop.`
                            : pending && slice.requestId
                              ? "Sign it to receive quote requests and jobs."
                              : slice.required
                                ? "ADX sends it for signature once the shop’s verification clears."
                                : "Not needed for your shop."}
                    </p>
                </div>
                {status && <Chip tone={slice.satisfied ? "success" : status.tone}>{slice.satisfied ? "Signed" : status.label}</Chip>}
            </div>
            {pending && slice.requestId && (
                <Link href={signingHref(slice.requestId, here)} className={cn(brandButton, "mt-5 gap-2")}>
                    <PenLine className="size-4" aria-hidden />
                    Sign now
                </Link>
            )}
        </Panel>
    );
}

/* ------------------------------------------------------------------ */
/* The e-signed documents                                              */
/* ------------------------------------------------------------------ */

function SigningLists({ rows, here }: { rows: SigningRequest[]; here: string }) {
    const { open, rest } = splitSigning(rows);
    const [busy, setBusy] = React.useState<string | null>(null);

    const download = async (row: SigningRequest) => {
        if (!row.files.signed) return;
        setBusy(row.id);
        try {
            await saveFile(row.files.signed, pdfName(row.title, true));
        } catch (caught) {
            toast.error(messageOf(caught, "Could not download the signed copy."));
        } finally {
            setBusy(null);
        }
    };

    if (rows.length === 0) {
        return (
            <div className="mt-6 rounded-lg border border-dashed border-line bg-white px-6 py-10 text-center">
                <p className="text-sm font-semibold text-ink">Nothing sent for signature yet</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-dim">Documents ADX asks you to sign appear here, with your copy once they are signed.</p>
            </div>
        );
    }

    return (
        <>
            {open.length > 0 && (
                <section className="mt-8">
                    <h2 className="text-base font-semibold text-ink">Waiting for your signature</h2>
                    <div className="mt-3 grid gap-3">
                        {open.map((row) => {
                            const status = signingStatusOf(row.status);
                            return (
                                <div key={row.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-white px-5 py-4">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                                            <PenLine className="size-4" aria-hidden />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-ink">{row.title}</p>
                                            <p className="text-xs text-dim">
                                                {row.label} · version {row.templateVersion} · link good until {dayMonthYear(row.expiresAt)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Chip tone={status.tone}>{status.label}</Chip>
                                        <Link href={signingHref(row.id, here)} className={cn(brandButton, "h-9 px-4")}>
                                            {row.status === "PARTIALLY_SIGNED" ? "View" : "Sign"}
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}
            {rest.length > 0 && (
                <section className="mt-8">
                    <h2 className="text-base font-semibold text-ink">Signed and past</h2>
                    <DataTable className="mt-3" columns={[{ label: "Document" }, { label: "Status", width: "190px" }, { label: "Date", width: "130px" }, { label: "", align: "right", width: "220px" }]}>
                        {rest.map((row) => {
                            const status = signingStatusOf(row.status);
                            return (
                                <TableRow key={row.id}>
                                    <Cell>
                                        <TitleCell title={row.title} line={`${row.label} · version ${row.templateVersion}`} href={signingHref(row.id, here)} />
                                    </Cell>
                                    <Cell>
                                        <Chip tone={status.tone}>{status.label}</Chip>
                                    </Cell>
                                    <Cell className="text-sm text-ink">{dayMonthYear(row.completedAt ?? row.requestedAt)}</Cell>
                                    <Cell align="right">
                                        {row.status === "COMPLETED" && row.files.signed ? (
                                            <button type="button" onClick={() => void download(row)} disabled={busy === row.id} className={cn(outlineButton, "h-9 gap-2 px-4")}>
                                                <FileText className="size-4" aria-hidden />
                                                {busy === row.id ? "Downloading…" : "Signed copy"}
                                            </button>
                                        ) : (
                                            <Link href={signingHref(row.id, here)} className={cn(outlineButton, "h-9 px-4")}>
                                                Open
                                            </Link>
                                        )}
                                    </Cell>
                                </TableRow>
                            );
                        })}
                    </DataTable>
                </section>
            )}
        </>
    );
}
