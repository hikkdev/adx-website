"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Chip, ChoiceRow, ChoiceTile, LabeledInput, ToggleRow } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import type { StepProps } from "@/components/planner/planner-step";
import { QrCode, qrSvgDocument } from "@/components/planner/qr-code";
import { messageOf } from "@/lib/api-client";
import {
    BASELINES,
    ensureUrl,
    isUrl,
    MEASUREMENT_WINDOWS,
    planPrefs,
    plannerHref,
    plannerService,
    REDEMPTION_WINDOWS,
    STEP_META,
    TRACKING_METHODS,
    utmContent,
    withUtm,
    type CampaignPatch,
    type PlanPrefs,
    type TrackingMethod,
} from "@/services/planner";

/**
 * 08 · Tracking & approvals (5204:71988): one measurement method with its
 * setup, the draft QR previews per booked placement, and the brand's
 * launch-approval switch. "Save and prepare artwork" records the plan and
 * hands the campaign to the booking flow.
 */
export function TrackingStep({ campaign, save }: StepProps) {
    const router = useRouter();
    const config = (campaign.trackingConfig ?? {}) as Record<string, unknown>;
    const [method, setMethod] = React.useState<TrackingMethod>(campaign.trackingMethod ?? "QR_OR_DEEPLINK");
    const [destinationUrl, setDestinationUrl] = React.useState<string>(typeof config.destinationUrl === "string" ? config.destinationUrl : "");
    const [utmCampaign, setUtmCampaign] = React.useState<string>(typeof config.utmCampaign === "string" ? config.utmCampaign : utmContent(campaign.name ?? ""));
    const [vanityUrl, setVanityUrl] = React.useState<string>(typeof config.vanityUrl === "string" ? config.vanityUrl : "");
    const [promoCode, setPromoCode] = React.useState<string>(typeof config.promoCode === "string" ? config.promoCode : "");
    const [redemptionWindow, setRedemptionWindow] = React.useState<string>(typeof config.redemptionWindow === "string" ? config.redemptionWindow : "THIRTY_DAYS");
    const [businessAddress, setBusinessAddress] = React.useState<string>(typeof config.businessAddress === "string" ? config.businessAddress : "");
    const [measurementWindowDays, setMeasurementWindowDays] = React.useState<7 | 14 | 30>(config.measurementWindowDays === 7 || config.measurementWindowDays === 30 ? config.measurementWindowDays : 14);
    const [baselinePeriod, setBaselinePeriod] = React.useState<string>(typeof config.baselinePeriod === "string" ? config.baselinePeriod : "SAME_MONTH_LAST_YEAR");
    const [prefs, setPrefs] = React.useState<PlanPrefs>(() => planPrefs.read(campaign.id));
    const [prepared, setPrepared] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const spots = campaign.spots.filter((spot) => spot.status !== "CANCELLED");
    const issued = campaign.codes.filter((code) => code.method === "QR_OR_DEEPLINK");
    const destination = ensureUrl(destinationUrl);
    const destinationOk = destinationUrl.trim() === "" || isUrl(destination);
    const vanity = ensureUrl(vanityUrl);
    const vanityOk = vanityUrl.trim() === "" || isUrl(vanity);

    /** One preview per booked placement: the issued code's own URL once the campaign is paid, a tagged draft before. */
    const previews = spots.map((spot) => {
        const code = issued.find((row) => row.spotId === spot.id);
        const content = utmContent(spot.listing.title);
        const draft = destination && isUrl(destination) ? withUtm(destination, utmCampaign.trim() || null, content) : null;
        return { spot, content, value: code?.url ?? draft, issued: Boolean(code) };
    });

    const ready =
        (method === "QR_OR_DEEPLINK" && destinationOk) ||
        (method === "VANITY_OR_PROMO" && vanityOk && (vanity !== "" || promoCode.trim() !== "")) ||
        (method === "LOCATION_LIFT" && businessAddress.trim().length >= 2) ||
        method === "NONE";

    const patchFor = (): CampaignPatch["tracking"] => {
        if (method === "QR_OR_DEEPLINK") {
            return { trackingMethod: "QR_OR_DEEPLINK", trackingConfig: { ...(destination ? { destinationUrl: destination } : {}), ...(utmCampaign.trim() ? { utmCampaign: utmCampaign.trim() } : {}) } };
        }
        if (method === "VANITY_OR_PROMO") {
            return { trackingMethod: "VANITY_OR_PROMO", trackingConfig: { ...(vanity ? { vanityUrl: vanity } : {}), ...(promoCode.trim() ? { promoCode: promoCode.trim().toUpperCase() } : {}), redemptionWindow } };
        }
        if (method === "LOCATION_LIFT") {
            return { trackingMethod: "LOCATION_LIFT", trackingConfig: { businessAddress: businessAddress.trim(), measurementWindowDays, baselinePeriod } };
        }
        return { trackingMethod: "NONE" };
    };

    const submit = async () => {
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            await save({ tracking: patchFor(), step: STEP_META.tracking.appStep });
            router.push(`/advertiser/campaigns/${encodeURIComponent(campaign.id)}/details`);
        } catch (caught) {
            setError(messageOf(caught, "Could not save the measurement plan."));
            setBusy(false);
        }
    };

    /** One SVG sheet with every placement's code and its label, saved through the browser. */
    const download = async () => {
        const drawable = previews.filter((p) => p.value);
        if (drawable.length === 0) return;
        const tiles: string[] = [];
        for (const [index, preview] of drawable.entries()) {
            let inner: string | null = null;
            if (preview.issued) {
                try {
                    const code = issued.find((row) => row.spotId === preview.spot.id)!;
                    const blob = await plannerService.trackingCodeSvg(campaign.id, code.code, 512);
                    inner = await blob.text();
                } catch {
                    inner = null;
                }
            }
            const svg = inner ?? qrSvgDocument(preview.value!, 512);
            if (!svg) continue;
            const body = svg.replace(/^<\?xml[^>]*>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
            const y = index * 640;
            tiles.push(`<g transform="translate(0 ${y})"><svg x="0" y="0" width="512" height="512" viewBox="0 0 512 512">${body}</svg><text x="0" y="560" font-family="Inter, Arial, sans-serif" font-size="28" fill="#141518">${preview.spot.listing.title.replace(/[<&>]/g, "")}</text><text x="0" y="596" font-family="Inter, Arial, sans-serif" font-size="20" fill="#77787d">utm_content=${preview.content}</text></g>`);
        }
        const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${drawable.length * 640}" viewBox="0 0 900 ${drawable.length * 640}"><rect width="100%" height="100%" fill="#fff"/>${tiles.join("")}</svg>`;
        const blob = new Blob([sheet], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${campaign.reference || "campaign"}-qr-codes.svg`;
        a.click();
        URL.revokeObjectURL(url);
        setPrepared(`QR file prepared · ${drawable.length} code${drawable.length === 1 ? "" : "s"}${drawable.some((p) => !p.issued) ? " (draft previews)" : ""}`);
    };

    return (
        <>
            <TaskCard title="Campaign tracking" intro="Choose one measurement method. Add its details before you prepare the artwork for your selected spaces.">
                <div role="radiogroup" aria-label="Measurement method" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {TRACKING_METHODS.map((option) => (
                        <ChoiceTile key={option.id} title={option.title} selected={method === option.id} onSelect={() => setMethod(option.id)} radio />
                    ))}
                </div>

                {method === "QR_OR_DEEPLINK" && (
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold leading-6 text-ink">QR code setup</h3>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <LabeledInput label="Destination URL" value={destinationUrl} onChange={setDestinationUrl} placeholder="https://yourbrand.example/offer" hint={!destinationOk ? "That does not read as a web address." : undefined} />
                            <LabeledInput label="UTM campaign tag" value={utmCampaign} onChange={setUtmCampaign} placeholder="festive-oct26" />
                        </div>
                        <p className="mt-5 text-sm text-dim">One unique QR code per booked slot. Use the matching code in each artwork file.</p>
                        {spots.length === 0 ? (
                            <p className="mt-4 text-sm text-dim">Choose ad spaces first — each booked slot gets a code of its own.</p>
                        ) : (
                            <ul className="mt-5 grid gap-6 xl:grid-cols-2">
                                {previews.map((preview) => (
                                    <li key={preview.spot.id} className="flex items-center gap-3">
                                        <div className="flex size-[152px] shrink-0 items-center justify-center rounded-lg border border-line bg-white">
                                            {preview.value ? (
                                                <QrCode value={preview.value} size={136} title={`QR code for ${preview.spot.listing.title}`} />
                                            ) : (
                                                <p className="px-3 text-center text-xs text-dim">Add a destination to draw the code</p>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-ink">{preview.spot.listing.title}</p>
                                            <p className="mt-1.5 truncate text-xs text-dim">{preview.issued ? "Issued code · counts every scan" : `utm_content=${preview.content}`}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-5 text-xs text-dim">
                            {issued.length > 0
                                ? "These are the campaign's issued codes; every scan is counted against its placement."
                                : "These draft previews use the destination above. Replace it with your live campaign URL before launch; the printed codes are issued when the campaign is paid for, and a code with no destination lands on ADX's own page and still counts."}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center gap-4">
                            <button
                                type="button"
                                onClick={() => void download()}
                                disabled={!previews.some((p) => p.value)}
                                className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_3px_0_#8d0b0c] hover:bg-[#a51b1b] disabled:pointer-events-none disabled:opacity-60"
                            >
                                Download QR codes
                            </button>
                            {prepared && <p className="text-sm text-dim">{prepared}</p>}
                        </div>
                    </div>
                )}

                {method === "VANITY_OR_PROMO" && (
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold leading-6 text-ink">Vanity URL and code</h3>
                        <p className="mt-2 text-sm text-dim">Use a memorable address or promo code on your artwork.</p>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <LabeledInput label="Vanity URL" value={vanityUrl} onChange={setVanityUrl} placeholder="yourbrand.example/festive" hint={!vanityOk ? "That does not read as a web address." : undefined} />
                            <LabeledInput label="Promo code (optional)" value={promoCode} onChange={(v) => setPromoCode(v.toUpperCase())} placeholder="FESTIVE20" />
                        </div>
                        <p className="mt-5 text-sm font-medium text-ink">Redemption window</p>
                        <div className="mt-2 flex flex-wrap gap-3">
                            {REDEMPTION_WINDOWS.map((window) => (
                                <Chip key={window.id} label={window.title} on={redemptionWindow === window.id} onClick={() => setRedemptionWindow(window.id)} />
                            ))}
                        </div>
                        <p className="mt-5 text-sm text-dim">Make sure the URL and promo code are active for the selected redemption window.</p>
                    </div>
                )}

                {method === "LOCATION_LIFT" && (
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold leading-6 text-ink">Location lift setup</h3>
                        <p className="mt-2 text-sm text-dim">Measure visits to your business location after exposure to this campaign.</p>
                        <div className="mt-5">
                            <LabeledInput label="Business address" value={businessAddress} onChange={setBusinessAddress} placeholder="Your store, showroom or branch" />
                        </div>
                        <p className="mt-5 text-sm font-medium text-ink">Measurement window</p>
                        <div className="mt-2 flex flex-wrap gap-3">
                            {MEASUREMENT_WINDOWS.map((window) => (
                                <Chip key={window.id} label={window.title} on={measurementWindowDays === window.id} onClick={() => setMeasurementWindowDays(window.id)} />
                            ))}
                        </div>
                        <p className="mt-5 text-sm font-medium text-ink">Baseline period</p>
                        <div role="radiogroup" aria-label="Baseline period" className="mt-2 grid gap-3 md:grid-cols-2">
                            {BASELINES.map((option) => (
                                <ChoiceRow key={option.id} title={option.title} description={option.description} selected={baselinePeriod === option.id} onSelect={() => setBaselinePeriod(option.id)} radio />
                            ))}
                        </div>
                        <p className="mt-5 text-sm text-dim">ADX will confirm measurement availability for your selected spaces before activation. Location lift is recorded on the brief; it needs a mobile-panel provider before a number is shown.</p>
                    </div>
                )}

                {method === "NONE" && (
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold leading-6 text-ink">Continue without response tracking</h3>
                        <p className="mt-2 text-sm text-dim">Your campaign will still include installation and display proofs. QR scans, promo-code redemptions and location lift will not be part of this measurement plan.</p>
                    </div>
                )}

                <div className="mt-6">
                    <h3 className="text-lg font-semibold leading-6 text-ink">Launch approval</h3>
                    <p className="mt-2 text-sm text-dim">Keep your brand’s sign-off separate from the publisher’s artwork and installation checks.</p>
                    <div className="mt-3">
                        <ToggleRow
                            title="Brand approves before launch"
                            description="Review the booking and final creative before the campaign can go live."
                            on={prefs.brandApproves}
                            onChange={(on) => setPrefs(planPrefs.write(campaign.id, { brandApproves: on }))}
                        />
                    </div>
                    <p className="mt-2 text-xs text-dim">Kept with your plan in this browser. The booking already pauses for your payment and for artwork approval; a separate brand sign-off is not a rule the backend keeps yet.</p>
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: plannerHref(campaign.id, "spaces") }} next={{ label: STEP_META.tracking.continueLabel, onClick: submit, disabled: !ready, busy, width: 264 }} />
        </>
    );
}
