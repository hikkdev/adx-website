import type { Metadata } from "next";
import { RequireStudio, StudioAuthProvider } from "@/lib/studio-auth";
import "@puckeditor/core/puck.css";
import "@/components/studio/studio.css";

export const metadata: Metadata = {
    title: { default: "Studio", template: "%s — ADX Studio" },
    robots: { index: false, follow: false },
};

/**
 * ST-1 (27 Sep 2026): Studio — the website's page editor, on the website.
 *
 * Its own session (the console's hand-off in the URL fragment), its own
 * chrome; never indexed. Everything under /studio sits inside the site's
 * root layout (fonts, brand variables, toasts) but outside the site's header
 * and footer.
 */
export default function StudioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="adx-studio min-h-screen bg-ground text-ink">
            <StudioAuthProvider>
                <RequireStudio>{children}</RequireStudio>
            </StudioAuthProvider>
        </div>
    );
}
