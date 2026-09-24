import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

/** The cart is a public page: the website's chrome around it, as the other site pages have. */
export default function CartLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="flex min-h-screen flex-col bg-ground">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
        </div>
    );
}
