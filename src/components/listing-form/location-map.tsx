"use client";

import "leaflet/dist/leaflet.css";
import * as React from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { LocateFixed } from "lucide-react";
import type { GeoPoint } from "./form-model";

/** The frame's red pin, drawn here so leaflet's default icon paths never matter. */
const pin = L.divIcon({
    className: "",
    html: '<span style="display:block;width:22px;height:22px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#e32227;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
});

const BENGALURU: [number, number] = [12.9716, 77.5946];

function Recenter({ point }: { point: GeoPoint | null }) {
    const map = useMap();
    const last = React.useRef<string>("");
    React.useEffect(() => {
        if (!point) return;
        const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
        if (key === last.current) return;
        last.current = key;
        map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 15));
    }, [map, point]);
    return null;
}

function ClickToPlace({ onPlace, disabled }: { onPlace: (point: GeoPoint) => void; disabled?: boolean }) {
    useMapEvents({
        click(event) {
            if (!disabled) onPlace({ latitude: event.latlng.lat, longitude: event.latlng.lng });
        },
    });
    return null;
}

/**
 * "Confirm the location pin" (5204:77900): OpenStreetMap under a draggable
 * pin. Click to place it, drag it to the exact spot, or take the browser's
 * own fix; the caption pill at the foot says which. Comparables are found
 * within 200 m, so this is the spot, not the neighbourhood.
 */
export function LocationMap({ point, onChange, disabled, height = 280 }: { point: GeoPoint | null; onChange: (next: GeoPoint) => void; disabled?: boolean; height?: number }) {
    const [locating, setLocating] = React.useState(false);
    const center: [number, number] = point ? [point.latitude, point.longitude] : BENGALURU;

    const locate = () => {
        if (!navigator.geolocation) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocating(false);
                onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude });
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 10_000 }
        );
    };

    return (
        <div className="relative overflow-hidden rounded-lg border border-line bg-[#f1f1ee]">
            <MapContainer center={center} zoom={point ? 15 : 11} scrollWheelZoom={false} style={{ height, width: "100%" }}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Recenter point={point} />
                <ClickToPlace onPlace={onChange} disabled={disabled} />
                {point && (
                    <Marker
                        position={[point.latitude, point.longitude]}
                        icon={pin}
                        draggable={!disabled}
                        eventHandlers={{
                            dragend(event) {
                                const at = (event.target as L.Marker).getLatLng();
                                onChange({ latitude: at.lat, longitude: at.lng });
                            },
                        }}
                    />
                )}
            </MapContainer>
            <div className="pointer-events-none absolute bottom-3 right-3 z-[400] flex items-center gap-2">
                {!disabled && (
                    <button type="button" onClick={locate} disabled={locating} className="pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[11px] font-semibold text-ink shadow-sm hover:border-ink disabled:opacity-60">
                        <LocateFixed className="size-3" aria-hidden />
                        {locating ? "Finding you…" : "Use my location"}
                    </button>
                )}
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-semibold text-ink shadow-sm">
                    <span className="size-2 rounded-full bg-brand-bright" aria-hidden />
                    {disabled ? "Pin on file" : point ? "Drag the pin to the exact spot" : "Click the map to drop the pin"}
                </span>
            </div>
        </div>
    );
}
