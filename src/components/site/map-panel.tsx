"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { cn } from "@/lib/utils";
import { perWeek, type BrowseCard } from "@/services/browse";

/** A plain pin, drawn here so the default icon's broken image paths never matter. */
const pin = L.divIcon({
    className: "",
    html: '<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#bd2020;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

/**
 * "Show map ↗" on Explore: the page's spaces as pins on OpenStreetMap, the
 * provider the console's maps use. A pin opens the name, the price and the
 * link to the space.
 */
export function MapPanel({ cards, className }: { cards: BrowseCard[]; className?: string }) {
    const pinned = cards.filter((c) => c.latitude !== null && c.longitude !== null) as (BrowseCard & { latitude: number; longitude: number })[];
    const center: [number, number] = pinned.length
        ? [pinned.reduce((s, c) => s + c.latitude, 0) / pinned.length, pinned.reduce((s, c) => s + c.longitude, 0) / pinned.length]
        : [12.9716, 77.5946];

    return (
        <div className={cn("overflow-hidden rounded-2xl border border-line bg-white shadow-card", className)}>
            <MapContainer center={center} zoom={pinned.length ? 12 : 11} scrollWheelZoom={false} style={{ height: 380, width: "100%" }}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {pinned.map((card) => (
                    <Marker key={card.id} position={[card.latitude, card.longitude]} icon={pin}>
                        <Popup>
                            <p className="text-sm font-semibold text-ink">{card.title}</p>
                            <p className="text-xs text-dim">{perWeek(card.ratePerDay)}</p>
                            <Link href={`/spaces/${encodeURIComponent(card.displayId ?? card.id)}`} className="text-xs font-semibold text-brand">
                                View space
                            </Link>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
            {pinned.length === 0 && <p className="px-4 py-2 text-xs text-dim">None of these spaces carries a map position yet.</p>}
        </div>
    );
}
