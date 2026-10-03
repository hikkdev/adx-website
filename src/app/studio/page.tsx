import type { Metadata } from "next";
import { StudioIndex } from "@/components/studio/studio-index";

export const metadata: Metadata = { title: "Pages" };

/** `/studio` — every page Studio lays out: the website's own, the custom ones, the four app homes. */
export default function StudioIndexPage() {
    return <StudioIndex />;
}
