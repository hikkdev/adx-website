import type { Metadata } from "next";
import { Suspense } from "react";
import { ChooseWorkspace } from "./choose-workspace";

export const metadata: Metadata = { title: "Choose your workspace" };

/** DR 12 · 03 · 03 · Choose your workspace (5204:61848). */
export default function ChooseWorkspacePage() {
    return (
        <Suspense>
            <ChooseWorkspace />
        </Suspense>
    );
}
