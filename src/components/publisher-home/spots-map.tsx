"use client";

import "leaflet/dist/leaflet.css";
import * as React from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { DashboardListing } from "@/services/publisher-workspace";
import { pinTone, placedSpots } from "./home-model";

const COLOURS = { booked: "#bd2020", free: "#141518", off: "#b8b9bc" } as const;

/** A round pin in the spot's colour, drawn here so leaflet's default icon paths never matter; the chosen one is larger. */
function pinFor(tone: keyof typeof COLOURS, selected: boolean) {
    const size = selected ? 20 : 14;
    return L.divIcon({
        className: "",
        html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${COLOURS[tone]};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

/** Fits the view to the pins whenever the set of pins changes. */
function FitTo({ points }: { points: { latitude: number; longitude: number }[] }) {
    const map = useMap();
    const key = points.map((p) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).join("|");
    React.useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView([points[0]!.latitude, points[0]!.longitude], 14);
            return;
        }
        map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])), { padding: [36, 36], maxZoom: 15 });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the key names the points
    }, [map, key]);
    return null;
}

/**
 * DR 01's map of the publisher's own spaces on OpenStreetMap (the
 * provider every website map uses): red where a booking holds the space
 * today, ink where it is live and free, grey where it is not live. Choosing
 * a pin opens its Location Card; choosing it again closes it.
 */
export function SpotsMap({ spots, selected, onSelect, height = 360 }: { spots: DashboardListing[]; selected: string | null; onSelect: (id: string | null) => void; height?: number }) {
    const placed = placedSpots(spots);
    const center: [number, number] = placed.length ? [placed[0]!.latitude, placed[0]!.longitude] : [12.9716, 77.5946];
    return (
        <div className="relative isolate overflow-hidden rounded-lg border border-line bg-[#f1f1ee]">
            <MapContainer center={center} zoom={placed.length ? 12 : 11} scrollWheelZoom={false} style={{ height, width: "100%" }}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <FitTo points={placed} />
                {placed.map((spot) => (
                    <Marker
                        key={spot.id}
                        position={[spot.latitude, spot.longitude]}
                        icon={pinFor(pinTone(spot), spot.id === selected)}
                        title={spot.title}
                        zIndexOffset={spot.id === selected ? 1000 : 0}
                        eventHandlers={{ click: () => onSelect(spot.id === selected ? null : spot.id) }}
                    />
                ))}
            </MapContainer>
            {placed.length === 0 && (
                <p className="pointer-events-none absolute inset-x-0 top-1/2 z-[400] -translate-y-1/2 text-center text-sm text-dim">Your spaces appear here once they have a pin</p>
            )}
        </div>
    );
}
