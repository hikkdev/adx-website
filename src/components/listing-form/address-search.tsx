"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { listingEditorService, type GeocodedPlace, type PlacePrediction } from "@/services/listing-editor";

function sessionToken(): string {
    return `web-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

/**
 * The address field with the map's suggestions under it (`GET
 * /geo/autocomplete` as the person types, `GET /geo/places/:id` on the
 * pick). A place picked fills the line, names the city and drops the pin;
 * typing over it keeps the pin, which is its own answer. When the maps
 * vendor answers nothing (no key on this environment) the line is still
 * a plain address box — the listing needs the words more than the vendor.
 */
export function AddressSearch({
    label,
    value,
    onChange,
    onPlace,
    placeholder,
    near,
    disabled,
    chevron,
}: {
    label: string;
    value: string;
    onChange: (next: string) => void;
    onPlace: (place: GeocodedPlace) => void;
    placeholder?: string;
    near?: { latitude: number; longitude: number } | null;
    disabled?: boolean;
    chevron?: boolean;
}) {
    const [session] = React.useState(sessionToken);
    const [predictions, setPredictions] = React.useState<{ key: string; items: PlacePrediction[] }>({ key: "", items: [] });
    const [open, setOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const typed = React.useRef("");

    React.useEffect(() => {
        const q = value.trim();
        if (!open || q.length < 3 || q === typed.current) return;
        let live = true;
        const timer = setTimeout(() => {
            listingEditorService
                .autocomplete(q, session, near)
                .then((items) => {
                    if (live) setPredictions({ key: q, items });
                })
                .catch(() => {
                    if (live) setPredictions({ key: q, items: [] });
                });
        }, 350);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [value, open, session, near]);

    const pick = async (prediction: PlacePrediction) => {
        setBusy(true);
        try {
            const place = await listingEditorService.place(prediction.placeId, session);
            typed.current = place.formattedAddress;
            onChange(place.formattedAddress);
            onPlace(place);
        } catch {
            typed.current = prediction.description;
            onChange(prediction.description);
        } finally {
            setBusy(false);
            setOpen(false);
        }
    };

    const geocodeTyped = async () => {
        const q = value.trim();
        if (q.length < 3 || busy) return;
        setBusy(true);
        try {
            const place = await listingEditorService.geocode(q);
            onPlace(place);
        } catch {
            /* No vendor, or nothing matched: the pin is set on the map instead. */
        } finally {
            setBusy(false);
        }
    };

    const shown = open && predictions.key === value.trim() ? predictions.items : [];

    return (
        <div className="relative">
            <label className={cn("relative block h-14 w-full rounded-md border border-line bg-white transition-colors focus-within:border-ink", disabled && "bg-ground")}>
                <span className="pointer-events-none absolute -top-[9px] left-3 bg-white px-1 text-[11px] leading-4 text-dim">{label}</span>
                <span className="flex h-full items-center gap-2 px-3 pt-2">
                    <input
                        value={value}
                        disabled={disabled}
                        onChange={(event) => {
                            typed.current = "";
                            onChange(event.target.value);
                            setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setTimeout(() => setOpen(false), 150)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                if (shown[0]) void pick(shown[0]);
                                else void geocodeTyped();
                            }
                        }}
                        placeholder={placeholder}
                        autoComplete="off"
                        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none disabled:cursor-not-allowed"
                    />
                    {!disabled && (
                        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={geocodeTyped} disabled={busy || value.trim().length < 3} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-line px-2 text-[11px] font-semibold text-ink hover:border-ink disabled:opacity-50" title="Find this address on the map">
                            <MapPin className="size-3" aria-hidden />
                            {busy ? "Finding…" : chevron ? "Find" : "Find on map"}
                        </button>
                    )}
                </span>
            </label>
            {shown.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-md border border-line bg-white p-1 shadow-card" role="listbox">
                    {shown.map((prediction) => (
                        <li key={prediction.placeId}>
                            <button type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => void pick(prediction)} className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-ground">
                                <span className="text-sm text-ink">{prediction.mainText}</span>
                                {prediction.secondaryText && <span className="text-xs text-dim">{prediction.secondaryText}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * The city, offered from ADX's catalogue as it is typed (`GET
 * /app/geo/cities?q=`) so "Bangalore" and "Bengaluru" are one market;
 * anything can still be typed, since a town the catalogue lacks is listable.
 */
export function CityField({ label = "City", value, onChange, disabled, placeholder = "Bengaluru" }: { label?: string; value: string; onChange: (next: string) => void; disabled?: boolean; placeholder?: string }) {
    const [open, setOpen] = React.useState(false);
    const [items, setItems] = React.useState<{ key: string; rows: { slug: string; name: string; state?: string | null; stage?: string }[] }>({ key: "", rows: [] });

    React.useEffect(() => {
        const q = value.trim();
        if (!open || q.length < 2) return;
        let live = true;
        const timer = setTimeout(() => {
            listingEditorService
                .cities(q)
                .then((answer) => {
                    if (live) setItems({ key: q, rows: [...answer.items, ...answer.comingSoon].slice(0, 8) });
                })
                .catch(() => {
                    if (live) setItems({ key: q, rows: [] });
                });
        }, 300);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [value, open]);

    const shown = open && items.key === value.trim() ? items.rows.filter((r) => r.name.toLowerCase() !== value.trim().toLowerCase()) : [];

    return (
        <div className="relative">
            <label className={cn("relative block h-14 w-full rounded-md border border-line bg-white transition-colors focus-within:border-ink", disabled && "bg-ground")}>
                <span className="pointer-events-none absolute -top-[9px] left-3 bg-white px-1 text-[11px] leading-4 text-dim">{label}</span>
                <span className="flex h-full items-center px-3 pt-2">
                    <input
                        value={value}
                        disabled={disabled}
                        onChange={(event) => {
                            onChange(event.target.value);
                            setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setTimeout(() => setOpen(false), 150)}
                        placeholder={placeholder}
                        autoComplete="off"
                        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-dim focus:outline-none disabled:cursor-not-allowed"
                    />
                </span>
            </label>
            {shown.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-line bg-white p-1 shadow-card" role="listbox">
                    {shown.map((city) => (
                        <li key={city.slug}>
                            <button type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(city.name); setOpen(false); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-ground">
                                <span className="text-sm text-ink">
                                    {city.name}
                                    {city.state ? <span className="text-dim"> · {city.state}</span> : null}
                                </span>
                                {city.stage && city.stage !== "LIVE" && <span className="text-[11px] text-dim">{city.stage.toLowerCase().replace(/_/g, " ")}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
