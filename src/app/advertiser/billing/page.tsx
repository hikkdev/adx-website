"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { messageOf } from "@/lib/api-client";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnSmall, ErrorPanel, LoadingLine, Segmented, useAsync } from "@/components/advertiser/bits";
import { BalanceCard, CreditsNote, HeldNote } from "@/components/billing/balance-card";
import { InvoicesTable } from "@/components/billing/invoices-table";
import { StatementTable } from "@/components/billing/statement";
import { PlanStatusCard } from "@/components/packages/plan-status-card";
import { advertiserWorkspace, invoicesSummary, type CampaignRow, type Invoice } from "@/services/advertiser-workspace";
import { packagesService, type ActivePackageRead } from "@/services/packages";
import { appendPage, chipEntries, entryDate, inr, STATEMENT_CHIPS, STATEMENT_PAGE_SIZE, statementChip, TOPUP_METHOD, walletService, type StatementChip, type TopUp, type WalletEntry, type WalletSnapshot } from "@/services/wallet";

/**
 * Wallet & billing — the app's Payments & billing (DR 04 · 4209:99) and its
 * Transactions & invoices (4209:101) on one page, beside the invoices this
 * page always listed (DR 12 · 07 · 06):
 *
 *  - the balance with its split (settled credit, ADX credits, held);
 *  - the plan card with Auto-renew (`GET/PATCH /packages/active`);
 *  - the statement under the app's chips — All / Payments / Refunds /
 *    Credits — by cursor with "Load more", each TOPUP line joined to the
 *    top-up ADX recorded (method, UTR, the day it landed) and each campaign
 *    charge to the campaign's name; the fifth chip is the invoices;
 *  - the money ADX recorded, and how money reaches the account.
 *
 * There is no "Add money" button, as in the app: the top-up route is
 * ADMIN-only — ADX records a transfer or a cheque that reached it — and a
 * card or UPI payment is taken on the campaign or plan payment page.
 */
export default function BillingPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading your wallet…</LoadingLine>}>
            <Billing />
        </React.Suspense>
    );
}

interface Loaded {
    wallet: WalletSnapshot;
    active: ActivePackageRead | null;
    entries: WalletEntry[];
    cursor: string | null;
    topUps: TopUp[] | null;
    invoices: Invoice[] | null;
    campaigns: CampaignRow[];
}

async function loadBilling(advertiserId: string): Promise<Loaded> {
    /* The balance is the one read that must succeed; everything else is decoration that fails to nothing. */
    const [wallet, active, statement, topUps, invoices, campaigns] = await Promise.all([
        walletService.wallet(advertiserId),
        packagesService.active().catch(() => null),
        walletService.statement(advertiserId).catch(() => null),
        walletService.topUps(advertiserId, { limit: 100 }).catch(() => null),
        advertiserWorkspace.invoices(advertiserId).catch(() => null),
        advertiserWorkspace.campaigns({ pageSize: 100 }).then((page) => page.items).catch(() => [] as CampaignRow[]),
    ]);
    return { wallet, active, entries: statement?.rows ?? [], cursor: statement?.nextCursor ?? null, topUps: topUps?.rows ?? null, invoices, campaigns };
}

function Billing() {
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const chip = statementChip(params.get("view"));
    const state = useAsync(`billing:${advertiserId ?? ""}`, async () => (advertiserId ? loadBilling(advertiserId) : null), "Could not read your wallet.");

    const setChip = (next: StatementChip, scroll = false) => {
        router.replace(next === "ALL" ? pathname : `${pathname}?view=${next}`, { scroll: false });
        if (scroll) document.getElementById("statement")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const heading = (
        <PageHeading
            title="Wallet & billing"
            subtitle="Your ADX wallet, every rupee it moved, your plan and the documents ADX issued."
            actions={
                <>
                    <Link href="/advertiser/billing/methods" className={btnOutline}>
                        Payment methods
                    </Link>
                    <Link href="/advertiser/billing/refunds" className={btnOutline}>
                        Refund requests
                    </Link>
                </>
            }
        />
    );

    if (state.kind === "loading" || (state.kind === "ready" && !state.value)) {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your wallet…</LoadingLine>
                </div>
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your wallet" message={`${state.message} Your balance is unaffected — try again in a moment.`} />
                <button type="button" onClick={state.reload} className={`${btnOutline} mt-4`}>
                    Try again
                </button>
            </>
        );
    }

    return (
        <>
            {heading}
            <BillingBody key={advertiserId} advertiserId={advertiserId!} loaded={state.value!} chip={chip} setChip={setChip} reload={state.reload} />
        </>
    );
}

function BillingBody({ advertiserId, loaded, chip, setChip, reload }: { advertiserId: string; loaded: Loaded; chip: StatementChip; setChip: (next: StatementChip, scroll?: boolean) => void; reload: () => void }) {
    const { wallet, active, topUps, invoices, campaigns } = loaded;
    const [entries, setEntries] = React.useState(loaded.entries);
    const [cursor, setCursor] = React.useState(loaded.cursor);
    const [more, setMore] = React.useState<"idle" | "busy">("idle");
    const [moreError, setMoreError] = React.useState<string | null>(null);
    const names = React.useMemo(() => Object.fromEntries(campaigns.map((c) => [c.id, c.name] as const)), [campaigns]);

    const loadMore = async () => {
        if (!cursor || more === "busy") return;
        setMore("busy");
        setMoreError(null);
        try {
            const page = await walletService.statement(advertiserId, { cursor });
            setEntries((current) => appendPage(current, page.rows));
            setCursor(page.nextCursor);
        } catch (caught) {
            setMoreError(messageOf(caught, "Could not load any earlier lines."));
        } finally {
            setMore("idle");
        }
    };

    const shown = chipEntries(chip, entries);

    return (
        <>
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 space-y-4">
                    <BalanceCard wallet={wallet} onStatement={() => setChip("ALL", true)} onInvoices={() => setChip("INVOICES", true)} />
                    <CreditsNote wallet={wallet} />
                    <HeldNote wallet={wallet} />
                </div>
                <div className="grid grid-cols-1 content-start gap-4">
                    <PlanStatusCard active={active} onChanged={reload} chooseHref="/advertiser/plans" />
                </div>
            </div>

            <section id="statement" className="mt-8 scroll-mt-24" aria-labelledby="statement-heading">
                <h2 id="statement-heading" className="text-base font-semibold text-ink">
                    {chip === "INVOICES" ? "Invoices" : "Transactions"}
                </h2>
                <p className="mt-1 text-xs text-dim">
                    {chip === "INVOICES"
                        ? invoices
                            ? invoicesSummary(invoices)
                            : "Could not load your invoices just now."
                        : "Every line on your wallet, newest first. A charge that paid for a campaign opens it."}
                </p>
                <div className="mt-3 overflow-x-auto">
                    <Segmented value={chip} options={STATEMENT_CHIPS.map((c) => ({ value: c.value, label: c.label }))} onChange={(next) => setChip(next)} />
                </div>

                <div className="mt-4">
                    {chip === "INVOICES" ? (
                        invoices === null ? (
                            <Panel>
                                <p className="text-sm text-dim">Could not load your invoices just now. The charges are still under the other chips.</p>
                                <button type="button" onClick={reload} className={`${btnSmall} mt-3`}>
                                    Try again
                                </button>
                            </Panel>
                        ) : (
                            <>
                                <InvoicesTable invoices={invoices} campaigns={campaigns} />
                                <p className="mt-3 text-xs text-dim">GST is itemised on every document. A credit note reverses the invoice it names; the two net to what you were charged.</p>
                            </>
                        )
                    ) : (
                        <>
                            <StatementTable
                                entries={shown}
                                topUps={topUps ?? []}
                                names={names}
                                empty={
                                    chip === "ALL"
                                        ? "Nothing on this account yet. The first line appears when ADX credits your wallet, or when a campaign you have confirmed goes live and its hold becomes a charge."
                                        : "Nothing of that kind has moved through your wallet yet."
                                }
                            />
                            {moreError && (
                                <p role="alert" className="mt-3 text-sm text-danger">
                                    {moreError}
                                </p>
                            )}
                            {cursor ? (
                                <div className="mt-4 flex justify-center">
                                    <button type="button" onClick={() => void loadMore()} disabled={more === "busy"} className={btnOutline}>
                                        {more === "busy" ? "Loading…" : "Load more"}
                                    </button>
                                </div>
                            ) : entries.length > STATEMENT_PAGE_SIZE ? (
                                <p className="mt-4 text-center text-xs text-dim">That is the whole statement.</p>
                            ) : null}
                            {chip !== "ALL" && cursor && <p className="mt-2 text-center text-xs text-dim">The chip narrows the lines read so far; Load more reads earlier ones.</p>}
                        </>
                    )}
                </div>
            </section>

            <div className="mt-8 grid items-start gap-4 md:grid-cols-2">
                <MoneyAdded topUps={topUps} />
                <HowMoneyArrives />
            </div>
            <p className="mt-4 text-xs text-dim">Credit that sits unused for twelve months lapses, and both your balance and your ADX credits go with it. Any charge or credit on the account restarts that clock.</p>

            <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
                <div>
                    <h2 className="text-base font-semibold text-ink">Need help with a charge or an invoice?</h2>
                    <p className="mt-1 text-sm text-dim">Create a request and include the invoice number or the date of the line so the team can find the right payment.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/advertiser/account#billing" className={btnOutline}>
                        Manage billing details
                    </Link>
                    <Link href="/advertiser/requests/new?topic=PAYMENT" className={btnOutline}>
                        Create a request
                    </Link>
                </div>
            </section>
        </>
    );
}

/** The top-ups ADX recorded — the only row that knows the method, the UTR and the day the money landed. */
function MoneyAdded({ topUps }: { topUps: TopUp[] | null }) {
    const recent = (topUps ?? []).slice(0, 4);
    return (
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="money-added">
            <h2 id="money-added" className="text-sm font-semibold text-ink">
                Money added
            </h2>
            {topUps === null ? (
                <p className="mt-2 text-xs text-dim">Could not read the top-ups ADX recorded. They still show as “Money added” in the transactions.</p>
            ) : recent.length === 0 ? (
                <p className="mt-2 text-xs text-dim">ADX has not recorded a transfer or a cheque against this wallet yet.</p>
            ) : (
                <ul className="mt-2 divide-y divide-line">
                    {recent.map((row) => (
                        <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                                <p className="text-sm text-ink">{TOPUP_METHOD[row.method] ?? row.method}</p>
                                <p className="text-xs text-dim [overflow-wrap:anywhere]">
                                    {[row.utr ? `${row.method === "CHEQUE" ? "Cheque" : "UTR"} ${row.utr}` : null, `received ${entryDate(row.receivedAt)}`].filter(Boolean).join(" · ")}
                                </p>
                            </div>
                            <span className="shrink-0 text-sm font-medium tabular-nums text-success">+{inr(row.amount)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** The central fact of the page, said where an "Add money" button would be. */
function HowMoneyArrives() {
    const bullets = [
        { title: "A transfer or a cheque you send ADX", detail: "ADX records it against your wallet with its UTR and the day it landed. Ask through a request and quote the UTR." },
        { title: "Goodwill credit, when a site lets you down", detail: "A publisher whose verification lapses part-way through your campaign forfeits that day, and it comes back to you as ADX credits." },
        { title: "A refund ADX finance releases", detail: "Cancel a campaign after it has started and the unused days come back once finance signs them off. Cancel before it starts and the hold is simply released." },
    ];
    return (
        <section className="rounded-lg border border-line bg-white p-5" aria-labelledby="how-money">
            <h2 id="how-money" className="text-sm font-semibold text-ink">
                How money reaches this account
            </h2>
            <ul className="mt-3 space-y-3">
                {bullets.map((bullet) => (
                    <li key={bullet.title} className="flex gap-3">
                        <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                        <span>
                            <span className="block text-sm font-medium text-ink">{bullet.title}</span>
                            <span className="block text-xs text-dim">{bullet.detail}</span>
                        </span>
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-dim">A card, UPI or bank-transfer payment is taken on the campaign or plan payment page itself — there is no separate top-up.</p>
        </section>
    );
}
