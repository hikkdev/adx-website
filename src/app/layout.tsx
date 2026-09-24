import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://adx.in"),
    title: { default: "ADX", template: "%s — ADX" },
    description: "Advertising spaces across India: find them, book them, run the campaign. Publishers list; advertisers book; ADX verifies.",
    icons: { icon: "/brand/adx-icon-tile.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en-IN" className={inter.variable}>
            <body className="font-sans">
                <AuthProvider>{children}</AuthProvider>
                <Toaster position="bottom-right" richColors closeButton />
            </body>
        </html>
    );
}
