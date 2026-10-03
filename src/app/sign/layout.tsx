import { SiteHeader } from "@/components/site/site-header";

/**
 * The e-sign page's frame: the site navigation over a quiet ground and one
 * card in the middle — the account screens' composition. It belongs to no
 * one workspace: a publisher, an advertiser and a print partner all sign here.
 */
export default function SignLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="flex min-h-screen flex-col bg-ground">
            <SiteHeader />
            <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-16 sm:pt-24">{children}</main>
        </div>
    );
}
