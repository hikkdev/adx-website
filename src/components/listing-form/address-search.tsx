"use client";

import * as React from "react";
import { MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { listingEditorService, type GeocodedPlace, type PlacePrediction } from "@/services/listing-editor";

function sessionToken(): string {
    return `web-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

/** The search box's words, as the console's publisher form says them. */
export const ADDRESS_SEARCH_PLACEHOLDER = "Type a building, street or landmark";
/** The address box under the "Find the address" bar — the console's words. */
export const ADDRESS_LINE_PLACEHOLDER = "Building, street, area";
/** The PIN box's words — the guidance is in the placeholder, never under one cell (form symmetry). */
export const PIN_PLACEHOLDER = "Six digits — 560001";
/** An Indian PIN as the backend validates it: six digits, never starting 0. */
export const PIN_PATTERN = /^[1-9][0-9]{5}$/;
/** Said under the bar when the maps vendor cannot be reached (no key, or down): the boxes still take the address. */
export const ADDRESS_SEARCH_UNAVAILABLE = "Address search is unavailable right now — type the address in the boxes below.";

/**
 * The map's suggestions for a typed address — one copy of the vendor
 * calls for every address field on the site: `GET /geo/autocomplete` as
 * the person types, `GET /geo/places/:id` on the pick. A pick writes the
 * formatted address into the line and hands the place on; typing over the
 * line afterwards is the person's own words and never undoes the pick.
 * When the vendor answers nothing the line is a plain address box.
 */
function useAddressSuggestions({ value, onChange, onPlace, near }: { value: string; onChange: (next: string) => void; onPlace: (place: GeocodedPlace) => void; near?: { latitude: number; longitude: number } | null }) {
    const [session] = React.useState(sessionToken);
    const [predictions, setPredictions] = React.useState<{ key: string; items: PlacePrediction[]; failed?: boolean }>({ key: "", items: [] });
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
                    if (live) setPredictions({ key: q, items: [], failed: true });
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

    const shown = open && predictions.key === value.trim() ? predictions.items : [];
    /* The vendor refused the last search (no key, or down) — the bar says so; the boxes still work. */
    const failed = predictions.failed === true && predictions.key === value.trim();

    const inputProps = {
        value,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            typed.current = "";
            onChange(event.target.value);
            setOpen(true);
        },
        onFocus: () => setOpen(true),
        onBlur: () => {
            setTimeout(() => setOpen(false), 150);
        },
        autoComplete: "off" as const,
        "aria-autocomplete": "list" as const,
    };

    return { shown, pick, busy, setBusy, inputProps, failed };
}

function SuggestionList({ id, shown, onPick }: { id?: string; shown: PlacePrediction[]; onPick: (prediction: PlacePrediction) => void }) {
    if (shown.length === 0) return null;
    return (
        <ul id={id} aria-label="Matching places" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-md border border-line bg-white p-1 shadow-card" role="listbox">
            {shown.map((prediction) => (
                <li key={prediction.placeId}>
                    <button type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(prediction)} className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-ground">
                        <span className="text-sm text-ink">{prediction.mainText}</span>
                        {prediction.secondaryText && <span className="text-xs text-dim">{prediction.secondaryText}</span>}
                    </button>
                </li>
            ))}
        </ul>
    );
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
    const { shown, pick, busy, setBusy, inputProps } = useAddressSuggestions({ value, onChange, onPlace, near });

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

    return (
        <div className="relative">
            <label className={cn("relative block h-14 w-full rounded-md border border-line bg-white transition-colors focus-within:border-ink", disabled && "bg-ground")}>
                <span className="pointer-events-none absolute -top-[9px] left-3 bg-white px-1 text-[11px] leading-4 text-dim">{label}</span>
                <span className="flex h-full items-center gap-2 px-3 pt-2">
                    <input
                        {...inputProps}
                        disabled={disabled}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                if (shown[0]) void pick(shown[0]);
                                else void geocodeTyped();
                            }
                        }}
                        placeholder={placeholder}
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
            <SuggestionList shown={shown} onPick={(prediction) => void pick(prediction)} />
        </div>
    );
}

/** What `AddressSuggest` hands the form's own input: spread it on the `<input>`. */
export type AddressInputProps = ReturnType<typeof useAddressSuggestions>["inputProps"] & {
    placeholder: string;
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * The same suggestions under any form's own address input — the form keeps
 * its label, box and height, and this draws only the list. A pick fills
 * the line and hands the place to `onPlace`, which fills the city, state,
 * PIN and country the form has (`fillFromPlace`) and, for a place someone
 * travels to, sets the form's pin. Enter picks the first suggestion when
 * one shows, and otherwise does what Enter always did in that form.
 */
export function AddressSuggest({
    value,
    onChange,
    onPlace,
    near,
    placeholder = ADDRESS_SEARCH_PLACEHOLDER,
    className,
    children,
}: {
    value: string;
    onChange: (next: string) => void;
    onPlace: (place: GeocodedPlace) => void;
    near?: { latitude: number; longitude: number } | null;
    placeholder?: string;
    className?: string;
    children: (input: AddressInputProps) => React.ReactNode;
}) {
    const { shown, pick, inputProps } = useAddressSuggestions({ value, onChange, onPlace, near });
    return (
        <div className={cn("relative", className)}>
            {children({
                ...inputProps,
                placeholder,
                onKeyDown: (event) => {
                    if (event.key === "Enter" && shown[0]) {
                        event.preventDefault();
                        void pick(shown[0]);
                    }
                },
            })}
            <SuggestionList shown={shown} onPick={(prediction) => void pick(prediction)} />
        </div>
    );
}

/**
 * "Find the address" — the one search bar every onboarding address form on
 * the site draws above its plain boxes (the owner, 1 Oct 2026: "a uniform
 * address search bar linked to maps … autofill all the way up to pincode
 * and lat long"). The console's `AddressFinder`, on the website's one copy
 * of the vendor calls: the label, a search icon inside on the left, the
 * placeholder, the suggestions under it. A pick hands the place to
 * `onPlace` — the form fills its boxes with `fillFromPlace` and keeps the
 * coordinates out of sight. Enter picks the first suggestion, or looks the
 * typed words up (`GET /geo/geocode`). The bar is never the saved line: the
 * Address box under it is, so typing there with no pick is what saves.
 */
export function AddressFinder({
    id,
    label = "Find the address",
    placeholder = ADDRESS_SEARCH_PLACEHOLDER,
    near,
    disabled,
    onPlace,
    className,
}: {
    /** The bar's input is `${id}-search`, its list `${id}-predictions`. */
    id: string;
    label?: string;
    placeholder?: string;
    near?: { latitude: number; longitude: number } | null;
    disabled?: boolean;
    onPlace: (place: GeocodedPlace) => void;
    className?: string;
}) {
    const [query, setQuery] = React.useState("");
    const [missed, setMissed] = React.useState(false);
    const { shown, pick, busy, setBusy, inputProps, failed } = useAddressSuggestions({ value: query, onChange: setQuery, onPlace, near });
    const listId = `${id}-predictions`;

    const geocodeTyped = async () => {
        const q = query.trim();
        if (q.length < 3 || busy) return;
        setBusy(true);
        setMissed(false);
        try {
            onPlace(await listingEditorService.geocode(q));
        } catch {
            setMissed(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={cn("relative", className)} data-testid="address-finder">
            <label htmlFor={`${id}-search`} className="block text-sm font-medium text-ink">
                {label}
            </label>
            <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" aria-hidden />
                <input
                    {...inputProps}
                    onChange={(event) => {
                        setMissed(false);
                        inputProps.onChange(event);
                    }}
                    id={`${id}-search`}
                    type="text"
                    role="combobox"
                    aria-expanded={shown.length > 0}
                    aria-controls={listId}
                    disabled={disabled}
                    placeholder={placeholder}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            if (shown[0]) void pick(shown[0]);
                            else void geocodeTyped();
                        }
                    }}
                    className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-dim focus:border-ink focus:outline-none disabled:bg-ground disabled:text-dim"
                />
                <SuggestionList id={listId} shown={shown} onPick={(prediction) => void pick(prediction)} />
            </div>
            {busy ? (
                <p className="mt-1.5 text-xs text-dim">Looking the place up…</p>
            ) : failed ? (
                <p className="mt-1.5 text-xs text-dim" role="status">
                    {ADDRESS_SEARCH_UNAVAILABLE}
                </p>
            ) : missed ? (
                <p className="mt-1.5 text-xs text-dim" role="status">
                    Nothing matched that address — type it in the boxes below.
                </p>
            ) : null}
        </div>
    );
}

/** A six-digit Indian PIN out of the vendor's postal code, or null when it named none. */
export function pinOf(place: Pick<GeocodedPlace, "postalCode">): string | null {
    const digits = (place.postalCode ?? "").replace(/\D/g, "");
    return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * The country a place's address ends in. The geo answer carries no country
 * of its own and ADX is India-only, so only a formatted address that ends
 * in "India" names one; anything else names none.
 */
export function countryOf(place: Pick<GeocodedPlace, "formattedAddress">): string | null {
    const last = place.formattedAddress.split(",").pop()?.trim() ?? "";
    return /^india$/i.test(last) ? "India" : null;
}

/**
 * Fills the fields a form has from a picked place — only those the place
 * names: a field the place is silent on keeps what it held. `address`
 * takes the formatted line; `point` takes the coordinates, which a form
 * keeps silently and sends with the save where its API takes them (the
 * owner, 1 Oct 2026: the onboarding forms never show them).
 */
export function fillFromPlace(
    place: GeocodedPlace,
    set: { address?: (v: string) => void; city?: (v: string) => void; state?: (v: string) => void; postalCode?: (v: string) => void; country?: (v: string) => void; point?: (v: { latitude: number; longitude: number }) => void },
): void {
    if (set.address && place.formattedAddress?.trim()) set.address(place.formattedAddress.trim());
    if (set.point && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) set.point({ latitude: place.latitude, longitude: place.longitude });
    if (set.city && place.city) set.city(place.city);
    if (set.state && place.state) set.state(place.state);
    const pin = pinOf(place);
    if (set.postalCode && pin) set.postalCode(pin);
    const country = countryOf(place);
    if (set.country && country) set.country(country);
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
