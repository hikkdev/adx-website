"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { AddressSearch } from "@/components/listing-form/address-search";
import type { LocationAnswer } from "@/services/forms";

const LocationMap = dynamic(() => import("@/components/listing-form/location-map").then((m) => m.LocationMap), {
    ssr: false,
    loading: () => <div className="h-[240px] animate-pulse rounded-lg border border-line bg-[#f1f1ee]" />,
});

/**
 * FM-1: a `location` field — the listing boards' address line with the
 * map's suggestions under it, and the map with the draggable pin, as the
 * publisher's business address is asked. The answer is the pin and the
 * words: `{ latitude, longitude, address }`; a place picked from the
 * suggestions drops the pin, and the pin dragged keeps the words.
 */
export function LocationField({ id, label, required, hint, value, onChange, error, disabled }: { id: string; label: string; required?: boolean; hint?: string | null; value: LocationAnswer | null; onChange: (next: LocationAnswer | null) => void; error?: string | null; disabled?: boolean }) {
    const [address, setAddress] = React.useState(value?.address ?? "");
    const point = value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) ? { latitude: value.latitude, longitude: value.longitude } : null;

    return (
        <div className="grid gap-3" data-field={id}>
            <AddressSearch
                label={required ? `${label} *` : label}
                value={address}
                disabled={disabled}
                onChange={(next) => {
                    setAddress(next);
                    if (point) onChange({ ...point, address: next });
                }}
                onPlace={(place) => {
                    setAddress(place.formattedAddress);
                    onChange({ latitude: place.latitude, longitude: place.longitude, address: place.formattedAddress });
                }}
                placeholder="Search the address, or type it"
                near={point}
            />
            <LocationMap point={point} height={240} disabled={disabled} onChange={(next) => onChange({ latitude: next.latitude, longitude: next.longitude, ...(address.trim() ? { address: address.trim() } : {}) })} />
            {error ? (
                <p id={`${id}-error`} role="alert" className="text-xs leading-4 text-danger">
                    {error}
                </p>
            ) : (
                <p className="text-xs leading-4 text-dim">{hint ?? (point ? "Pinned on the map — drag the pin to the exact spot if it is off." : "Search the address above, or click the map to drop the pin.")}</p>
            )}
        </div>
    );
}
