"use client";

import "leaflet/dist/leaflet.css";
import * as React from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

const BENGALURU: [number, number] = [12.9716, 77.5946];

const pin = L.divIcon({
    className: "",
    html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#8d0b0c;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

const smallPin = L.divIcon({
    className: "",
    html: '<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#bd2020;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

export interface MapPoint {
    latitude: number;
    longitude: number;
    label?: string;
}

function zoomFor(radiusKm: number | null): number {
    if (!radiusKm) return 12;
    if (radiusKm <= 1) return 14;
    if (radiusKm <= 5) return 12;
    if (radiusKm <= 10) return 11;
    if (radiusKm <= 25) return 10;
    return 9;
}

/** Follows the centre and the radius as the controls change them. */
function Follow({ center, radiusKm, pins }: { center: MapPoint | null; radiusKm: number | null; pins: MapPoint[] }) {
    const map = useMap();
    React.useEffect(() => {
        if (center) {
            map.setView([center.latitude, center.longitude], zoomFor(radiusKm));
            return;
        }
        if (pins.length > 0) {
            const bounds = L.latLngBounds(pins.map((p) => [p.latitude, p.longitude] as [number, number]));
            map.fitBounds(bounds.pad(0.4), { maxZoom: 13 });
        }
    }, [map, center?.latitude, center?.longitude, radiusKm, pins]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

function ClickToPlace({ onPlace }: { onPlace?: (point: MapPoint) => void }) {
    useMapEvents({
        click(event) {
            onPlace?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
        },
    });
    return null;
}

/**
 * The planner's map (5204:70839): OpenStreetMap tiles — the provider the
 * console's maps use — with the campaign's circle around a draggable centre,
 * or its venue pins. Clicking the map moves the centre; so does dragging it.
 */
export function RadiusMap({
    center,
    radiusKm = null,
    pins = [],
    onCenterChange,
    height = 320,
}: {
    center: MapPoint | null;
    radiusKm?: number | null;
    pins?: MapPoint[];
    onCenterChange?: (point: MapPoint) => void;
    height?: number;
}) {
    const initial: [number, number] = center ? [center.latitude, center.longitude] : pins[0] ? [pins[0].latitude, pins[0].longitude] : BENGALURU;
    return (
        <div className="overflow-hidden rounded-lg bg-[#f0f2f1]" style={{ height }}>
            <MapContainer center={initial} zoom={zoomFor(radiusKm)} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Follow center={center} radiusKm={radiusKm} pins={pins} />
                {onCenterChange && <ClickToPlace onPlace={onCenterChange} />}
                {center && radiusKm && (
                    <Circle center={[center.latitude, center.longitude]} radius={radiusKm * 1000} pathOptions={{ color: "#8d0b0c", weight: 1.5, fillColor: "#8d0b0c", fillOpacity: 0.12 }} />
                )}
                {center && (
                    <Marker
                        position={[center.latitude, center.longitude]}
                        icon={pin}
                        draggable={Boolean(onCenterChange)}
                        eventHandlers={{
                            dragend(event) {
                                const at = (event.target as L.Marker).getLatLng();
                                onCenterChange?.({ latitude: at.lat, longitude: at.lng });
                            },
                        }}
                    >
                        {center.label && <Tooltip direction="top" offset={[0, -10]}>{center.label}</Tooltip>}
                    </Marker>
                )}
                {pins.map((point, index) => (
                    <Marker key={`${point.latitude},${point.longitude},${index}`} position={[point.latitude, point.longitude]} icon={smallPin}>
                        {point.label && <Tooltip direction="top" offset={[0, -8]}>{point.label}</Tooltip>}
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}

export default RadiusMap;
