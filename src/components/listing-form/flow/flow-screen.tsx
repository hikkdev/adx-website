"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Catalogue, DescriptionBucket } from "@/services/listing-editor";
import type { FlowField, FlowScreen, WizardFlow } from "@/services/flows";
import { GroupTitle, Note, Row } from "../fields";
import { summaryOf, type ListingForm } from "../form-model";
import { InstantBookingSwitch, useInstantBookingOn } from "../instant-booking";
import { CategoryExtras, MissingBasicsNotice } from "../steps-choose";
import { Fact, ReviewRow, useCityStage } from "../steps-review";
import { SuggestedRateCard } from "../suggested-rate";
import { SelectedFormat } from "../wizard-frame";
import { FlowFieldView, type FlowFieldContext } from "./flow-field";
import { AVAILABILITY_FIELD, collects, documentRowsOf, DRAWABLE_KINDS, fieldAsked, flowGaps, formInPlay, isBlank, isChoiceScreen, pairable, PRICE_FIELD, readAnswer, screenForBakedStep, sectionText } from "./flow-model";

/**
 * FL-1 (27 Sep 2026): one screen of `flows.listing`, drawn as the boards
 * draw a step. The fields come in the flow's order; two short controls in
 * a row are paired (Width | Height, Illumination | Facing, Min. booking |
 * Available from — the form symmetry rule: a hint goes under the whole
 * row, never under one cell); a section heads its group, and the first
 * section on a screen, when it names an earlier answer, is the red format
 * line under the title. The app-only extras sit where the apps put them:
 * the instant-booking switch under `available_from`, ADX's suggested rate
 * under `base_price` once the listing exists, the site's own category
 * notes under the branching cards, and the review summary on the last
 * screen.
 */
export interface FlowScreenViewProps extends FlowFieldContext {
    flow: WizardFlow;
    screen: FlowScreen;
    /** The screens in play — the root, then the chosen branch. */
    screens: FlowScreen[];
    /** Whether this is the last screen: the review, with its summary. */
    isLast: boolean;
    kycVerified: boolean;
    missingBasics: { words: string; href: string } | null;
    go: (screenKey: string) => void;
}

export function FlowScreenView({ flow, screen, screens, isLast, kycVerified, missingBasics, go, ...ctx }: FlowScreenViewProps) {
    const branching = screen.fields.some((f) => f.branching && f.type === "selectable-cards");
    /* The listing-data-gaps lot: a site question this spot is not asked (pixels on a printed face, the vehicle on a wall) is not drawn — nor a heading left with nothing under it. */
    const fields = askedFields(screen.fields, ctx);
    const drawable = fields.filter((f) => DRAWABLE_KINDS.has(f.type) || f.type === "section");
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i]!;
        const next = fields[i + 1];
        if (field.type === "section") {
            const first = drawable[0] === field;
            rows.push(first && field.from ? <SelectedFormat key={field.id}>{sectionOf(field, ctx)}</SelectedFormat> : <GroupTitle key={field.id} className={i > 0 ? "pt-4" : undefined}>{sectionOf(field, ctx)}</GroupTitle>);
            continue;
        }
        if (pairable(field, next)) {
            rows.push(
                <React.Fragment key={field.id}>
                    <Row>
                        <FlowFieldView field={field} ctx={ctx} />
                        <FlowFieldView field={next!} ctx={ctx} />
                    </Row>
                    {hintOf(field)}
                    {hintOf(next!)}
                    {extrasAfter([field, next!], ctx)}
                </React.Fragment>
            );
            i += 1;
            continue;
        }
        rows.push(
            <React.Fragment key={field.id}>
                <FlowFieldView field={field} ctx={ctx} />
                {hintOf(field)}
                {extrasAfter([field], ctx)}
            </React.Fragment>
        );
    }

    return (
        <div className={cn(isChoiceScreen(screen) ? "space-y-6" : "space-y-2.5")}>
            {branching && <MissingBasicsNotice missingBasics={missingBasics} />}
            {isLast && <FlowReviewSummary flow={flow} screens={screens} form={ctx.form} catalogue={ctx.catalogue} go={go} />}
            {rows}
            {branching && <CategoryExtras kycVerified={kycVerified} />}
        </div>
    );
}

/** The fields this spot is asked, and the headings whose first question still is. */
export function askedFields(all: FlowField[], ctx: Pick<FlowFieldContext, "form" | "catalogue">): FlowField[] {
    const asked = all.filter((f) => f.type === "section" || fieldAsked(f, ctx.form, ctx.catalogue));
    return asked.filter((field) => {
        if (field.type !== "section") return true;
        const start = all.indexOf(field);
        const end = all.findIndex((f, j) => j > start && f.type === "section");
        const group = all.slice(start + 1, end === -1 ? undefined : end);
        // A heading over nothing at all is the console's to make; a heading names what follows it, so it goes when that is hidden.
        return group.length === 0 || asked.includes(group[0]!);
    });
}

/** The section's words, resolved off the form (`from` names an answer); the caller decides whether it is the red format line or a group heading. */
const sectionOf = (field: FlowField, ctx: FlowFieldContext): string => sectionText(field, ctx.form, ctx.catalogue);

/** A field's hint, one muted line under it (or under the row it shares). A checkbox's statement is its description, drawn by the control itself. */
function hintOf(field: FlowField): React.ReactNode {
    if (!field.hint || field.type === "geo-point") return null;
    return (
        <Note key={`${field.id}-hint`} className="text-xs">
            {field.hint}
        </Note>
    );
}

/** The app-drawn extras under the server's fields (`listing-flow-screen.tsx`): the switch under the availability, the offer under the price. */
function extrasAfter(fields: FlowField[], ctx: FlowFieldContext): React.ReactNode {
    const ids = fields.map((f) => f.id);
    return (
        <>
            {ids.includes(AVAILABILITY_FIELD) && <InstantBookingSwitch key="instant" value={ctx.form.instantBooking} onChange={(instantBooking) => ctx.set({ instantBooking })} className="mt-2" />}
            {ids.includes(PRICE_FIELD) && ctx.listingId && (
                /* Lot E: ADX's offer, once the listing exists — a submit that got part of the way. Accepting writes the rate; the form follows it, per day. */
                <SuggestedRateCard key="offer" listingId={ctx.listingId} onAccepted={(next) => next.ratePerDay && ctx.set({ basePrice: String(Number(next.ratePerDay)), pricingUnit: "PER_DAY" })} />
            )}
        </>
    );
}

/** "3 of 5 answered" — what a screen holds so far, for its review row. */
export function screenLine(screen: FlowScreen, form: ListingForm, catalogue: Catalogue | null = null): { line: string; muted: boolean } {
    const asked = screen.fields.filter((f) => collects(f) && DRAWABLE_KINDS.has(f.type) && fieldAsked(f, form, catalogue));
    const answered = asked.filter((f) => (f.type === "checkbox" ? readAnswer(form, f.id) === true : !isBlank(readAnswer(form, f.id))));
    if (asked.length === 0) return { line: screen.subtitle ?? "Nothing to fill in here.", muted: true };
    if (answered.length === 0) return { line: "Not added yet", muted: true };
    return { line: `${answered.length} of ${asked.length} answered · ${answered.map((f) => f.label).slice(0, 3).join(", ")}${answered.length > 3 ? "…" : ""}`, muted: false };
}

/**
 * The review's summary (5204:80161) over the flow: the facts off the form,
 * the city's stage, the two red links, what is still needed, then one row
 * per earlier screen with Edit — the frames' rows, named by the flow.
 */
export function FlowReviewSummary({ flow, screens, form, catalogue, go }: { flow: WizardFlow; screens: FlowScreen[]; form: ListingForm; catalogue: Catalogue | null; go: (screenKey: string) => void }) {
    const s = summaryOf(form, catalogue);
    const instantOn = useInstantBookingOn();
    const cityNote = useCityStage(form.category === "MEDIA" ? form.coverage || form.city : form.city);
    const gaps = flowGaps(flow, form, catalogue);
    const proofs = documentRowsOf(formInPlay(form, flow)).length;
    const categoryScreen = screenForBakedStep("category", screens);
    const pricingScreen = screenForBakedStep("pricing", screens);
    const earlier = screens.slice(0, -1).filter((screen) => !screen.fields.some((f) => f.branching));
    return (
        <div className="mb-6">
            <p className="text-sm font-semibold text-ink">Listing Summary</p>
            <p className="mt-1 text-xs text-dim">Built from your selected category, venue and pricing details.</p>
            <div className="mt-5 space-y-5">
                <Fact label="Category" value={s.category} />
                <Fact label="Venue" value={s.venue} />
                <div className="grid gap-5 md:grid-cols-2">
                    <Fact label="Spot type" value={s.spotType} />
                    <Fact label="Area" value={s.area} />
                </div>
                <Fact label="Location" value={s.location} />
                <Fact label="Pricing" value={s.pricing} />
                {instantOn && <Fact label="Bookings" value={form.instantBooking ? "Accepted automatically" : "Reviewed by you"} />}
                <Fact label="Proofs attached" value={proofs === 0 ? "None — review will wait for them" : `${proofs} document${proofs === 1 ? "" : "s"}`} />
            </div>
            {cityNote && (
                <div role="status" className={cn("mt-5 rounded-md border px-4 py-3 text-sm", cityNote.tone === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-info/30 bg-info-soft text-info")}>
                    {cityNote.text}
                </div>
            )}
            <div className="mt-6 space-y-3">
                {categoryScreen && (
                    <button type="button" onClick={() => go(categoryScreen.key)} className="block text-sm font-medium text-brand-bright hover:underline">
                        Edit category, venue or format
                    </button>
                )}
                {pricingScreen && (
                    <button type="button" onClick={() => go(pricingScreen.key)} className="block text-sm font-medium text-brand-bright hover:underline">
                        Edit listing price
                    </button>
                )}
            </div>
            {gaps.length > 0 && (
                <div className="mt-5 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
                    Still needed before this can be sent: {gaps.map((g) => `${g.screen.title}: ${g.fields.join(", ")}`).join("; ")}.
                </div>
            )}
            <div className="mt-6">
                {earlier.map((screen) => {
                    const { line, muted } = screenLine(screen, form, catalogue);
                    return <ReviewRow key={screen.key} title={screen.title} line={line} onEdit={() => go(screen.key)} muted={muted} />;
                })}
                <div className="border-t border-line pt-4">
                    <Note>ADX reviews every listing before it goes live. You will be told either way.</Note>
                </div>
            </div>
        </div>
    );
}
