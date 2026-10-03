import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioEditor } from "@/components/studio/studio-editor";
import { isAppSurface } from "@/services/studio";

export const metadata: Metadata = { title: "App home editor" };

/** `/studio/app/[surface]` — one of the four app homes in a 390-px phone frame. `app-advertiser-home` is read as `APP_ADVERTISER_HOME`. */
export default async function StudioAppEditor({ params }: { params: Promise<{ surface: string }> }) {
    const { surface } = await params;
    const normalised = decodeURIComponent(surface).trim().toUpperCase().replace(/-/g, "_");
    if (!isAppSurface(normalised)) notFound();
    return <StudioEditor target={{ kind: "surface", surface: normalised }} />;
}
