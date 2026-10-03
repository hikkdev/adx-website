"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeading, Panel } from "@/components/workspace/page-heading";
import { useAdvertiser } from "@/app/advertiser/layout";
import { btnOutline, btnPrimary, Cell, ErrorPanel, LoadingLine, Segmented, StatusChip, TablePanel, Td, Th, useAsync } from "@/components/advertiser/bits";
import { BrandFormDialog, BrandLogo } from "@/components/brands/brand-form-dialog";
import { BRAND_CHIPS, brandChip, brandPill, brandsService, campaignsLine, chipStatus, countLine, industryLine, matchesBrand, spentLabel, type BrandCard, type BrandChip } from "@/services/brands";

/**
 * Brands — DR 06's Brands (4417:1873) on the web: the names an advertiser
 * books under, with the three chips (the server's `?status=`), a search the
 * browser does (the endpoint has no `q`, and the list is short), and a row
 * per brand: name over industry, campaigns running, and what it has spent.
 * "Add brand" opens the form for the two facts a new brand needs.
 */
export default function BrandsPage() {
    return (
        <React.Suspense fallback={<LoadingLine>Loading your brands…</LoadingLine>}>
            <Brands />
        </React.Suspense>
    );
}

function Brands() {
    const advertiser = useAdvertiser();
    const advertiserId = advertiser?.id ?? null;
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const chip = brandChip(params.get("chip"));
    const [query, setQuery] = React.useState("");
    const [adding, setAdding] = React.useState(false);
    const state = useAsync(`brands:${advertiserId ?? ""}:${chip}`, async () => (advertiserId ? brandsService.list(advertiserId, chipStatus(chip)) : null), "Could not read your brands.");

    const setChip = (next: BrandChip) => router.replace(next === "ALL" ? pathname : `${pathname}?chip=${next}`, { scroll: false });

    const heading = (
        <PageHeading
            title="Brands"
            subtitle="The names you book under. Each brand's campaigns collect beneath it."
            actions={
                <button type="button" onClick={() => setAdding(true)} disabled={!advertiserId} className={btnPrimary}>
                    Add brand
                </button>
            }
        />
    );

    const dialog = advertiserId && (
        <BrandFormDialog
            open={adding}
            onClose={() => setAdding(false)}
            onSave={async (input) => {
                const created = await brandsService.create(advertiserId, input);
                setAdding(false);
                toast.success(`${input.name} added.`);
                if (created?.id) router.push(`/advertiser/brands/${encodeURIComponent(created.id)}`);
                else state.reload();
            }}
        />
    );

    if (state.kind === "loading" || (state.kind === "ready" && !state.value)) {
        return (
            <>
                {heading}
                <div className="mt-6">
                    <LoadingLine>Loading your brands…</LoadingLine>
                </div>
                {dialog}
            </>
        );
    }
    if (state.kind === "error") {
        return (
            <>
                {heading}
                <ErrorPanel title="Could not read your brands" message={state.message} />
                <button type="button" onClick={state.reload} className={`${btnOutline} mt-4`}>
                    Try again
                </button>
                {dialog}
            </>
        );
    }

    const cards = state.value!;
    const shown = cards.filter((card) => matchesBrand(card, query));

    return (
        <>
            {heading}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <Segmented value={chip} options={BRAND_CHIPS} onChange={setChip} />
                    <span className="text-sm text-dim">{countLine(shown.length)}</span>
                </div>
                <label className="relative w-full max-w-[280px]">
                    <span className="sr-only">Search brands</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search brands" className="h-10 w-full rounded-full border border-line bg-white pl-9 pr-4 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none" />
                </label>
            </div>

            {shown.length === 0 ? (
                <Panel className="mt-4">
                    <p className="text-sm font-medium text-ink">{emptyTitle(chip, query)}</p>
                    <p className="mt-1 text-sm text-dim">{emptyDetail(chip, query)}</p>
                    {chip === "ALL" && !query.trim() && (
                        <button type="button" onClick={() => setAdding(true)} className={`${btnOutline} mt-4`}>
                            Add your first brand
                        </button>
                    )}
                </Panel>
            ) : (
                <TablePanel className="mt-4">
                    <thead>
                        <tr>
                            <Th>Brand</Th>
                            <Th>Campaigns</Th>
                            <Th align="right">Spent</Th>
                            <Th>Status</Th>
                            <Th />
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((card) => (
                            <BrandLine key={card.id} card={card} />
                        ))}
                    </tbody>
                </TablePanel>
            )}
            {dialog}
        </>
    );
}

function BrandLine({ card }: { card: BrandCard }) {
    const pill = brandPill(card);
    const spent = spentLabel(card);
    const href = `/advertiser/brands/${encodeURIComponent(card.id)}`;
    return (
        <tr className="border-t border-line">
            <Td>
                <Link href={href} className="flex items-center gap-3 hover:text-brand">
                    <BrandLogo src={card.logoUrl} name={card.name} className="size-9" />
                    <Cell title={<span className="font-medium">{card.name}</span>} line={industryLine(card)} />
                </Link>
            </Td>
            <Td className="text-ink">{campaignsLine(card)}</Td>
            <Td align="right" className="whitespace-nowrap tabular-nums text-ink">
                {spent ?? <span className="text-dim">—</span>}
            </Td>
            <Td>
                <StatusChip label={pill.label} tone={pill.tone} />
            </Td>
            <Td align="right">
                <Link href={href} className="whitespace-nowrap text-sm font-semibold text-ink hover:text-brand">
                    View brand
                </Link>
            </Td>
        </tr>
    );
}

function emptyTitle(chip: BrandChip, query: string): string {
    if (query.trim()) return "Nothing matches that";
    if (chip === "ACTIVE") return "No active brands";
    if (chip === "ARCHIVED") return "Nothing archived";
    return "No brands yet";
}

function emptyDetail(chip: BrandChip, query: string): string {
    if (query.trim()) return "Try a shorter name, or clear the search.";
    if (chip === "ACTIVE") return "A brand you add appears here until you archive it.";
    if (chip === "ARCHIVED") return "A brand you archive keeps its campaigns and moves here.";
    return "Add the name you book under, and its campaigns collect beneath it.";
}
