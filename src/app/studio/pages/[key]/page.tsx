import type { Metadata } from "next";
import { StudioEditor } from "@/components/studio/studio-editor";

export const metadata: Metadata = { title: "Page editor" };

/** `/studio/pages/[key]` — the editor for one website page, system (its versions on `/layouts/:surface`) or custom (`/site/pages/:key`). */
export default async function StudioPageEditor({ params }: { params: Promise<{ key: string }> }) {
    const { key } = await params;
    return <StudioEditor target={{ kind: "page", key: decodeURIComponent(key) }} />;
}
