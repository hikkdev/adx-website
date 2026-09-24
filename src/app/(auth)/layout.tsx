import { SiteHeader } from "@/components/site/site-header";

/**
 * The account-access screens (DR 12 board 03): the site navigation over a
 * quiet ground, one card in the middle. No footer — the card is the page.
 */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="flex min-h-screen flex-col bg-ground">
            <SiteHeader />
            <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-24">{children}</main>
        </div>
    );
}
