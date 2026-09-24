"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Chip, Divider, LabeledInput, Segmented, ToggleRow } from "@/components/planner/fields";
import { InlineError, StepActions, TaskCard } from "@/components/planner/planner-shell";
import type { StepProps } from "@/components/planner/planner-step";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    marketPatch,
    planPrefs,
    plannerHref,
    plannerService,
    poiPatch,
    radiusPatch,
    RADII,
    STEP_META,
    TARGETING,
    type CampaignPoi,
    type PickerCity,
    type PlacePrediction,
    type PlanPrefs,
    type TargetingMethod,
} from "@/services/planner";

const RadiusMap = dynamic(() => import("@/components/planner/radius-map").then((m) => m.RadiusMap), {
    ssr: false,
    loading: () => <div className="h-[320px] rounded-lg bg-[#f0f2f1]" />,
});

type Point = { latitude: number; longitude: number };

function sessionToken(): string {
    return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/**
 * The centre-location box with the places behind it: `GET /geo/autocomplete`
 * as you type, `GET /geo/places/:id` for the pin, `GET /geo/geocode` on Enter
 * for a typed address. A geo door that is not configured says so.
 */
function PlaceSearch({
    label,
    value,
    onChange,
    onPlace,
    placeholder,
    near,
}: {
    label: string;
    value: string;
    onChange: (text: string) => void;
    onPlace: (place: { label: string; address: string; point: Point }) => void;
    placeholder?: string;
    near: Point | null;
}) {
    const [predictions, setPredictions] = React.useState<{ key: string; rows: PlacePrediction[] }>({ key: "", rows: [] });
    const [open, setOpen] = React.useState(false);
    const [note, setNote] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const session = React.useRef(sessionToken());
    const typed = value.trim();

    React.useEffect(() => {
        if (typed.length < 2 || !open) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            plannerService
                .autocomplete({ input: typed, session: session.current, near, radiusM: near ? 50_000 : undefined })
                .then((rows) => {
                    if (!cancelled) setPredictions({ key: typed, rows });
                })
                .catch((caught: unknown) => {
                    if (cancelled) return;
                    setPredictions({ key: typed, rows: [] });
                    if (caught instanceof ApiError && (caught.status === 503 || caught.status === 404)) setNote("Place search is not available yet — press Enter to look the address up, or click the map to place the centre.");
                });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [typed, open, near]);

    const choose = async (prediction: PlacePrediction) => {
        setBusy(true);
        setNote(null);
        try {
            const place = await plannerService.place(prediction.placeId, session.current);
            session.current = sessionToken();
            onPlace({ label: prediction.description, address: place.formattedAddress, point: { latitude: place.latitude, longitude: place.longitude } });
            setOpen(false);
        } catch (caught) {
            setNote(messageOf(caught, "Could not read that place."));
        } finally {
            setBusy(false);
        }
    };

    const lookUp = async () => {
        if (typed.length < 3) return;
        setBusy(true);
        setNote(null);
        try {
            const place = await plannerService.geocode(typed);
            onPlace({ label: typed, address: place.formattedAddress, point: { latitude: place.latitude, longitude: place.longitude } });
            setOpen(false);
        } catch (caught) {
            setNote(messageOf(caught, "No place matches that address."));
        } finally {
            setBusy(false);
        }
    };

    const rows = predictions.key === typed ? predictions.rows : [];
    return (
        <div className="relative">
            <LabeledInput
                label={label}
                value={value}
                onChange={(text) => {
                    onChange(text);
                    setOpen(true);
                }}
                placeholder={placeholder}
                autoComplete="off"
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        if (rows[0]) void choose(rows[0]);
                        else void lookUp();
                    }
                    if (event.key === "Escape") setOpen(false);
                }}
            />
            {open && rows.length > 0 && (
                <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-white py-1 shadow-card">
                    {rows.map((row) => (
                        <li key={row.placeId}>
                            <button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => void choose(row)} className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-ground">
                                <span className="text-sm text-ink">{row.mainText}</span>
                                {row.secondaryText && <span className="text-xs text-dim">{row.secondaryText}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {(busy || note) && <p className="mt-2 text-sm text-dim">{busy ? "Looking it up…" : note}</p>}
        </div>
    );
}

/** The market list (`GET /app/geo/cities?stage=LAUNCHED`): the cities ADX sells in, searchable. */
function MarketPicker({ value, onChange }: { value: string | null; onChange: (market: string) => void }) {
    const [query, setQuery] = React.useState("");
    const [result, setResult] = React.useState<{ key: string; rows: PickerCity[] | null; error: string | null }>({ key: "\u0000", rows: null, error: null });
    const typed = query.trim();

    React.useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(
            () => {
                plannerService
                    .cities({ q: typed || undefined, stages: ["LAUNCHED"], limit: typed ? 40 : 24 })
                    .then((page) => {
                        if (!cancelled) setResult({ key: typed, rows: page.items, error: null });
                    })
                    .catch((caught: unknown) => {
                        if (!cancelled) setResult({ key: typed, rows: null, error: messageOf(caught, "Could not read the markets.") });
                    });
            },
            typed ? 250 : 0
        );
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [typed]);

    const rows = result.key === typed ? result.rows : null;
    return (
        <div>
            <LabeledInput label="Market" value={query} onChange={setQuery} placeholder="Search a city ADX is live in" autoComplete="off" />
            {value && <p className="mt-2 text-sm text-ink">Chosen: <span className="font-medium">{value}</span></p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {rows === null && !result.error && <p className="text-sm text-dim">Loading markets…</p>}
                {result.error && <p className="text-sm text-dim">{result.error}</p>}
                {rows?.map((city) => {
                    const on = value === city.name;
                    return (
                        <button
                            key={city.slug}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onChange(city.name)}
                            className={cn("flex h-12 items-center justify-between rounded-lg border px-4 text-left text-sm transition-colors", on ? "border-brand bg-[#fffafa] text-ink" : "border-line bg-white text-ink hover:border-ink")}
                        >
                            <span className="truncate">{city.name}</span>
                            {city.state && <span className="ml-2 shrink-0 text-xs text-dim">{city.state}</span>}
                        </button>
                    );
                })}
                {rows && rows.length === 0 && <p className="text-sm text-dim">No live market matches “{typed}”.</p>}
            </div>
        </div>
    );
}

/**
 * 04 · Targeting & location (5204:70595): Radius, Market or DMA, or POI
 * venue — one of the three saved, the other two cleared — and the
 * placement preferences under the divider.
 */
export function LocationStep({ campaign, save }: StepProps) {
    const router = useRouter();
    const [method, setMethod] = React.useState<TargetingMethod>(campaign.targetingMethod ?? "RADIUS");
    const [location, setLocation] = React.useState(campaign.targetingMethod === "RADIUS" ? (campaign.targetLocation ?? "") : "");
    const [centre, setCentre] = React.useState<Point | null>(campaign.targetLatitude !== null && campaign.targetLongitude !== null ? { latitude: campaign.targetLatitude, longitude: campaign.targetLongitude } : null);
    const [km, setKm] = React.useState<number>(campaign.targetRadiusKm ?? 10);
    const [market, setMarket] = React.useState<string | null>(campaign.targetMarket);
    const [pois, setPois] = React.useState<CampaignPoi[]>(campaign.pois);
    const [venueText, setVenueText] = React.useState("");
    const [prefs, setPrefs] = React.useState<PlanPrefs>(() => planPrefs.read(campaign.id));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const setPref = (patch: Partial<PlanPrefs>) => setPrefs(planPrefs.write(campaign.id, patch));
    const firstPin = pois.find((poi) => poi.latitude !== null && poi.longitude !== null);
    const poiNear = React.useMemo<Point | null>(() => (firstPin ? { latitude: firstPin.latitude!, longitude: firstPin.longitude! } : null), [firstPin?.latitude, firstPin?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

    const ready = method === "RADIUS" ? centre !== null && km > 0 : method === "MARKET_OR_DMA" ? Boolean(market) : pois.some((poi) => poi.latitude !== null && poi.longitude !== null);

    const submit = async () => {
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            const patch =
                method === "RADIUS"
                    ? radiusPatch({ location, latitude: centre!.latitude, longitude: centre!.longitude, km })
                    : method === "MARKET_OR_DMA"
                      ? marketPatch(market!)
                      : poiPatch(pois.filter((poi) => poi.latitude !== null && poi.longitude !== null));
            await save({ ...patch, step: STEP_META.location.appStep });
            router.push(plannerHref(campaign.id, "triggers"));
        } catch (caught) {
            setError(messageOf(caught, "Could not save the location."));
            setBusy(false);
        }
    };

    const placeCentre = async (point: Point) => {
        setCentre(point);
        try {
            const place = await plannerService.reverse(point.latitude, point.longitude);
            setLocation(place.formattedAddress);
        } catch {
            /* The pin is the answer; a name for it is a nicety. */
        }
    };

    return (
        <>
            <TaskCard title="Location">
                <Segmented options={TARGETING} value={method} onChange={setMethod} className="w-[420px] max-w-full" />

                {method === "RADIUS" && (
                    <div className="mt-6 space-y-5">
                        <PlaceSearch label="Centre location" value={location} onChange={setLocation} near={centre} placeholder="An area, a landmark or an address" onPlace={(place) => { setLocation(place.label); setCentre(place.point); }} />
                        <RadiusMap center={centre ? { ...centre, label: location || undefined } : null} radiusKm={km} onCenterChange={(point) => void placeCentre(point)} />
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-ink">Distance from the centre</span>
                            <span className="font-semibold text-ink">{km} km</span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {RADII.map((choice) => (
                                <Chip key={choice} label={`${choice} km`} on={km === choice} onClick={() => setKm(choice)} className="w-[84px]" />
                            ))}
                        </div>
                        {!centre && <p className="text-sm text-dim">Search a place, or click the map, to put the centre down. Spaces are matched inside this circle.</p>}
                    </div>
                )}

                {method === "MARKET_OR_DMA" && (
                    <div className="mt-6">
                        <MarketPicker value={market} onChange={setMarket} />
                        <p className="mt-3 text-sm text-dim">The whole city is the target. ADX recommends one market per campaign — different cities mean different languages and habits.</p>
                    </div>
                )}

                {method === "POI_VENUE" && (
                    <div className="mt-6 space-y-5">
                        <PlaceSearch
                            label="Add a venue"
                            value={venueText}
                            onChange={setVenueText}
                            near={poiNear}
                            placeholder="A mall, a stadium, a campus…"
                            onPlace={(place) => {
                                setPois((current) => [...current, { label: place.label.split(",")[0]?.trim() || place.label, address: place.address, latitude: place.point.latitude, longitude: place.point.longitude }]);
                                setVenueText("");
                            }}
                        />
                        <RadiusMap center={null} pins={pois.filter((poi) => poi.latitude !== null && poi.longitude !== null).map((poi) => ({ latitude: poi.latitude!, longitude: poi.longitude!, label: poi.label }))} />
                        {pois.length > 0 ? (
                            <ul className="divide-y divide-line rounded-lg border border-line">
                                {pois.map((poi, index) => (
                                    <li key={`${poi.label}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-ink">{poi.label}</p>
                                            <p className="truncate text-xs text-dim">{poi.address ?? (poi.latitude !== null ? `${poi.latitude.toFixed(4)}, ${poi.longitude?.toFixed(4)}` : "No pin yet")}</p>
                                        </div>
                                        <button type="button" aria-label={`Remove ${poi.label}`} onClick={() => setPois((current) => current.filter((_, i) => i !== index))} className="flex size-8 items-center justify-center rounded-full text-dim hover:bg-ground hover:text-ink">
                                            <X className="size-4" aria-hidden />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-dim">Add at least one venue. Spaces within 2 km of each pin are matched.</p>
                        )}
                    </div>
                )}

                <div className="my-6">
                    <Divider />
                </div>

                <div className="space-y-3.5">
                    <h3 className="text-lg font-semibold leading-6 text-ink">Placement preferences</h3>
                    <p className="text-sm text-dim">Set the surroundings your brand is comfortable appearing in.</p>
                    <ToggleRow title="Avoid alcohol-adjacent placements" description="No slots next to alcohol billboards" on={prefs.avoidAlcohol} onChange={(on) => setPref({ avoidAlcohol: on })} />
                    <ToggleRow title="Avoid politically sensitive content" description="Block slots flagged for political nearby content" on={prefs.avoidPolitical} onChange={(on) => setPref({ avoidPolitical: on })} />
                    <ToggleRow title="Avoid competitor adjacencies" description="No placements within 100m of named competitors" on={prefs.avoidCompetitors} onChange={(on) => setPref({ avoidCompetitors: on })} />
                    <p className="text-xs text-dim">Kept with your plan in this browser. ADX does not filter the shortlist by adjacency yet — the preferences travel to the booking as notes, not as a rule.</p>
                </div>
                {error && (
                    <div className="mt-4">
                        <InlineError message={error} />
                    </div>
                )}
            </TaskCard>
            <StepActions back={{ label: "Back", href: plannerHref(campaign.id, "audience") }} next={{ label: STEP_META.location.continueLabel, onClick: submit, disabled: !ready, busy }} />
        </>
    );
}
