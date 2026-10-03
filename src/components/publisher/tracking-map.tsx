"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";

type Point = { latitude: number; longitude: number; label: string };

const dot = (color: string, size: number) =>
    L.divIcon({
        className: "",
        html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });

const SPOT = dot("#bd2020", 16);
const INSTALLER = dot("#141518", 14);

/**
 * Track installation's map on OpenStreetMap, the provider the website's
 * other maps use: the spot, and the installer where they last shared their
 * position, with a straight line between the two. Loaded without SSR —
 * Leaflet needs a window.
 */
export function TrackingMap({ spot, installer, height = 280 }: { spot: Point | null; installer: Point | null; height?: number }) {
    const points = [spot, installer].filter((p): p is Point => p !== null);
    const center: [number, number] = points.length ? [points.reduce((s, p) => s + p.latitude, 0) / points.length, points.reduce((s, p) => s + p.longitude, 0) / points.length] : [12.9716, 77.5946];
    const bounds = points.length === 2 ? L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])).pad(0.3) : undefined;
    return (
        <div className="relative isolate z-0">
            <MapContainer center={center} zoom={points.length ? 14 : 11} bounds={bounds} scrollWheelZoom={false} style={{ height, width: "100%" }}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {spot && (
                    <Marker position={[spot.latitude, spot.longitude]} icon={SPOT}>
                        <Tooltip direction="top" offset={[0, -8]} permanent>
                            {spot.label}
                        </Tooltip>
                    </Marker>
                )}
                {installer && (
                    <Marker position={[installer.latitude, installer.longitude]} icon={INSTALLER}>
                        <Tooltip direction="top" offset={[0, -8]} permanent>
                            {installer.label}
                        </Tooltip>
                    </Marker>
                )}
                {spot && installer && (
                    <Polyline
                        positions={[
                            [spot.latitude, spot.longitude],
                            [installer.latitude, installer.longitude],
                        ]}
                        pathOptions={{ color: "#141518", weight: 2, dashArray: "4 6", opacity: 0.6 }}
                    />
                )}
            </MapContainer>
        </div>
    );
}
