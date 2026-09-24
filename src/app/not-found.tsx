import Link from "next/link";

export default function NotFound() {
    return (
        <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col items-center justify-center px-5 py-16 text-center">
            <p className="text-[40px] font-extrabold tracking-tight text-ink">404</p>
            <h1 className="mt-2 text-[28px] font-semibold text-ink">Nothing here</h1>
            <p className="mt-1.5 text-dim">That page does not exist. The spaces are still where they were.</p>
            <Link href="/spaces" className="mt-6 inline-block rounded bg-brand px-6 py-2.5 text-sm font-medium text-white">
                Explore spaces
            </Link>
        </main>
    );
}
