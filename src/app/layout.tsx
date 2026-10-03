import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cache } from "react";
import { Toaster } from "sonner";
import { AppStatusChrome } from "@/components/platform/app-status-chrome";
import { AppStatusProvider } from "@/lib/app-status";
import { AuthProvider } from "@/lib/auth";
import { BrandProvider } from "@/lib/brand";
import { FlagsProvider } from "@/lib/flags";
import { NotificationsProvider } from "@/lib/notifications";
import { PageViewMarker } from "@/lib/promotion-events";
import { SiteRoutesProvider } from "@/lib/site-links";
import { readSiteRoutes, rememberSiteRoutes } from "@/lib/site-routes";
import { cssVariablesBlock, readSiteBrand } from "@/services/branding";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

/** One read of the brand per render, shared by the metadata and the page. */
const brandForRender = cache(() => readSiteBrand());

/** PB-1: one read of the address table per render — every link to a system page goes through it. */
const routesForRender = cache(() => readSiteRoutes());

/**
 * The site's title, description, icon and share image from the Website
 * surface of Settings › Brand & theme (`GET /app/branding`, read on the
 * server and kept five minutes). A backend that does not answer leaves the
 * site's own words — nothing here can fail a page.
 */
export async function generateMetadata(): Promise<Metadata> {
    const brand = await brandForRender();
    return {
        metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://adx.in"),
        title: { default: brand.title, template: `%s — ${brand.platformName}` },
        description: brand.description,
        icons: { icon: brand.faviconUrl },
        ...(brand.ogImageUrl ? { openGraph: { images: [brand.ogImageUrl] } } : {}),
    };
}

/**
 * Every page's frame: the session, the switches, the bell and the platform
 * status around it; the brand's colours, when ops retuned them, as the CSS
 * variables the Tailwind `brand` tokens are drawn in; and over it all the
 * maintenance page or the incident banner `/app/status` asks for.
 */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const [brand, routes] = await Promise.all([brandForRender(), routesForRender()]);
    const brandCss = cssVariablesBlock(brand.cssVariables);
    /* PB-1: the server components under this layout (the footer, say) link through the same table the browser gets. */
    rememberSiteRoutes(routes);
    return (
        <html lang="en-IN" className={inter.variable}>
            <head>{brandCss ? <style id="adx-brand" dangerouslySetInnerHTML={{ __html: brandCss }} /> : null}</head>
            <body className="font-sans">
                <SiteRoutesProvider table={routes}>
                    <BrandProvider brand={brand}>
                        <AppStatusProvider>
                            <AuthProvider>
                                <FlagsProvider>
                                    <NotificationsProvider>
                                        <AppStatusChrome />
                                        <PageViewMarker />
                                        {children}
                                    </NotificationsProvider>
                                </FlagsProvider>
                            </AuthProvider>
                        </AppStatusProvider>
                    </BrandProvider>
                </SiteRoutesProvider>
                <Toaster position="bottom-right" richColors closeButton />
            </body>
        </html>
    );
}
