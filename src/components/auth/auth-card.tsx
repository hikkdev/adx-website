import { cn } from "@/lib/utils";

/**
 * The 530px card every account-access screen sits in (5204:61748): the
 * wordmark on its own row above a rule, then the screen's own content.
 */
export function AuthCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={cn("w-full max-w-[530px] rounded-lg border border-line bg-white shadow-card", className)}>
            <div className="border-b border-line px-10 py-8">
                <img src="/brand/adx-wordmark-red.svg" alt="ADX" className="h-[30px] w-auto" />
            </div>
            <div className="px-10 pb-10 pt-7">{children}</div>
        </section>
    );
}

export function AuthTitle({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
    return (
        <>
            <h1 className="text-[30px] font-bold leading-10 tracking-tight text-ink">{title}</h1>
            <p className="mt-0.5 text-sm text-ink">{subtitle}</p>
        </>
    );
}

export const primaryButton =
    "flex h-[58px] w-full items-center justify-center rounded-md bg-brand text-sm font-semibold text-white transition-colors hover:bg-[#a51b1b] disabled:cursor-not-allowed disabled:opacity-60";
