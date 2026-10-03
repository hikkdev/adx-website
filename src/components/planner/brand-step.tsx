"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Divider, NativeField } from "@/components/planner/fields";
import { ContentCategoryQuestion } from "@/components/planner/content-category";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import type { StepProps } from "@/components/planner/planner-step";
import { useAdvertiser } from "@/app/advertiser/layout";
import { messageOf } from "@/lib/api-client";
import { plannerHref, plannerService, STEP_META, SUBCATEGORIES, type BrandSeed, type Campaign } from "@/services/planner";

const FALLBACK_INDUSTRIES = ["Retail", "Food & beverage", "Real estate", "Education", "Healthcare", "Automotive", "Finance", "Entertainment", "E-commerce", "Government", "NGO", "Other"];

/**
 * 01 · Brand & campaign (5204:69932). The first screen opens the draft
 * (`POST /campaigns`) and saves the brand block; every later visit saves
 * the block onto the draft it already has. DR 06: started from a brand's
 * page (`?brandId=`), the draft is created under that brand and the fields
 * start from it. Lot D (Q138): what the ad is about — the content category
 * every booked venue is checked against — is asked here, with the brand.
 */
export function BrandStep({ campaign, save, brandId = null }: Omit<StepProps, "campaign"> & { campaign: Campaign | null; brandId?: string | null }) {
    const router = useRouter();
    const advertiser = useAdvertiser();
    const [brandName, setBrandName] = React.useState(campaign?.brandName ?? "");
    const [productName, setProductName] = React.useState(campaign?.productName ?? "");
    const [industry, setIndustry] = React.useState(campaign?.industry ?? "");
    const [subCategory, setSubCategory] = React.useState(campaign?.subCategory ?? "");
    const [contentCategoryId, setContentCategoryId] = React.useState<string | null>(campaign?.contentCategoryId ?? null);
    const [industries, setIndustries] = React.useState<string[]>(FALLBACK_INDUSTRIES);
    const [brand, setBrand] = React.useState<BrandSeed | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        plannerService
            .industries()
            .then((rows) => {
                if (!cancelled && rows.length) setIndustries(rows);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    /* A campaign started under a brand: its name and industry fill the fields the person has not typed into. */
    const advertiserId = advertiser?.id ?? null;
    React.useEffect(() => {
        if (campaign || !brandId || !advertiserId) return;
        let cancelled = false;
        plannerService
            .brand(advertiserId, brandId)
            .then((row) => {
                if (cancelled) return;
                setBrand(row);
                setBrandName((current) => current || row.name);
                setIndustry((current) => current || row.industry || "");
                setSubCategory((current) => current || row.subCategory || "");
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [campaign, brandId, advertiserId]);

    /* A new draft opens with the account's name in the box; typing replaces it, clearing it leaves the placeholder. */
    const suggested = campaign ? "" : (brand?.name ?? advertiser?.name ?? "");
    const brandValue = brandName.trim() || suggested;
    const ready = brandValue.length > 0 && industry.trim().length > 0;
    const options = industries.includes(industry) || !industry ? industries : [industry, ...industries];

    const submit = async () => {
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        const patch = {
            brandName: brandValue,
            productName: productName.trim() || null,
            industry: industry.trim() || null,
            subCategory: subCategory.trim() || null,
            contentCategoryId,
            name: productName.trim() ? `${brandValue} · ${productName.trim()}` : brandValue,
            step: STEP_META.brand.appStep,
            ...(!campaign && brand?.awareness ? { awareness: brand.awareness } : {}),
        };
        try {
            let id = campaign?.id ?? null;
            if (!id) {
                const created = await plannerService.create({ name: patch.name, ...(brandId ? { brandId } : {}) });
                id = created.id;
                await plannerService.patch(id, patch);
            } else {
                await save(patch);
            }
            router.push(plannerHref(id, "goal"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the brand details."));
            setBusy(false);
        }
    };

    return (
        <>
            <TaskCard title="Brand details" intro={brand && !campaign ? `This campaign starts under your brand ${brand.name}; its spend and results show on the brand's page.` : undefined}>
                <div className="space-y-[18px]">
                    <NativeField label="Brand name" value={brandName} onChange={setBrandName} placeholder={suggested || "The name on the artwork"} />
                    <NativeField label="Product or service" value={productName} onChange={setProductName} placeholder="What this campaign promotes" />
                    <NativeField label="Industry" value={industry} onChange={setIndustry} options={options} placeholder="Choose an industry" />
                    <NativeField label="Subcategory" value={subCategory} onChange={setSubCategory} suggestions={SUBCATEGORIES[industry] ?? []} placeholder="Narrow it down" />
                </div>
                <div className="my-6">
                    <Divider />
                </div>
                <ContentCategoryQuestion value={contentCategoryId} onChange={setContentCategoryId} />
                <p className="mt-7 text-sm text-dim">Next, choose what this campaign should achieve.</p>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: brandId ? "/advertiser/brands" : "/advertiser/campaigns" }} next={{ label: STEP_META.brand.continueLabel, onClick: submit, disabled: !ready, busy }} />
        </>
    );
}
