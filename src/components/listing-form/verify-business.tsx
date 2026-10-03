"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { messageOf } from "@/lib/api-client";
import { listingEditorService, type PublisherKyc, type PublisherProfile } from "@/services/listing-editor";
import { ADDRESS_LINE_PLACEHOLDER, AddressFinder, fillFromPlace, PIN_PATTERN, PIN_PLACEHOLDER } from "./address-search";
import { LabelledInput, Note, Problem } from "./fields";
import type { StoredFile } from "./form-model";
import { DropZone, FileRow } from "./uploads";

function maskMobile(mobile: string | null | undefined): string {
    if (!mobile) return "";
    const digits = mobile.replace(/\D/g, "");
    if (digits.length < 6) return mobile;
    const tail = digits.slice(-3);
    const head = digits.slice(0, digits.length - 8);
    return `+${head} ${digits.slice(head.length, head.length + 2)}••• ••${tail}`;
}

type Loaded = { key: string; me: PublisherProfile | null; kyc: PublisherKyc | null; error: string | null };

type Fields = { name: string; email: string; contactName: string; gstin: string; address: string; city: string; state: string; postalCode: string };

/**
 * 29 · Verify your business (5204:82615): the business and contact details
 * (`PATCH /publishers/me`) and one supporting document (`POST /upload`
 * purpose KYC, then `POST /publishers/me/kyc` as the business registration
 * certificate). The phone number is the account and cannot be typed here.
 *
 * Onboarding addresses (the owner, 1 Oct 2026): the business address is the
 * "Find the address" bar over plain boxes — Address, City | State, PIN — no
 * map; a pick's coordinates go up with the save, never shown.
 */
export function VerifyBusiness() {
    const router = useRouter();
    const [loaded, setLoaded] = React.useState<Loaded>({ key: "", me: null, kyc: null, error: null });
    const [fields, setFields] = React.useState<Fields | null>(null);
    /* The coordinates of the place picked in the bar — sent with the save, never shown. */
    const [point, setPoint] = React.useState<{ latitude: number; longitude: number } | null>(null);
    const [file, setFile] = React.useState<StoredFile | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [me, kyc] = await Promise.all([listingEditorService.publisher(), listingEditorService.kyc().catch(() => null)]);
                if (cancelled) return;
                setLoaded({ key: "me", me, kyc, error: null });
                setFields({ name: me.name ?? "", email: me.email ?? "", contactName: me.contactName ?? "", gstin: me.gstin ?? "", address: me.address ?? "", city: me.city ?? "", state: me.state ?? "", postalCode: me.postalCode ?? "" });
            } catch (caught) {
                if (!cancelled) setLoaded({ key: "me", me: null, kyc: null, error: messageOf(caught, "Could not read your business details.") });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const me = loaded.me;
    const put = (patch: Partial<NonNullable<typeof fields>>) => setFields((current) => (current ? { ...current, ...patch } : current));

    const submit = async () => {
        if (!fields || !me) return;
        if (fields.postalCode.trim() && !PIN_PATTERN.test(fields.postalCode.trim())) {
            setProblem("A PIN code is six digits, like 560001.");
            return;
        }
        if (!file && !loaded.kyc?.businessRegCertUrl) {
            setProblem("Add the supporting business document before submitting.");
            return;
        }
        setBusy(true);
        setProblem(null);
        try {
            const patch: Record<string, unknown> = {};
            if (fields.name.trim() && fields.name.trim() !== me.name) patch.name = fields.name.trim();
            if (fields.email.trim() && fields.email.trim() !== (me.email ?? "")) patch.email = fields.email.trim();
            if (fields.contactName.trim() && fields.contactName.trim() !== (me.contactName ?? "")) patch.contactName = fields.contactName.trim();
            if (fields.gstin.trim() && fields.gstin.trim().toUpperCase() !== (me.gstin ?? "")) patch.gstin = fields.gstin.trim().toUpperCase();
            for (const key of ["address", "city", "state", "postalCode"] as const) {
                const value = fields[key].trim();
                if (value && value !== (me[key] ?? "")) patch[key] = value;
            }
            /* Both or neither, and only after a pick: typed by hand, the coordinates keep what they were. */
            if (point) {
                patch.latitude = point.latitude;
                patch.longitude = point.longitude;
            }
            if (Object.keys(patch).length) await listingEditorService.updatePublisher(patch);
            if (file) await listingEditorService.submitKyc({ businessRegCertUrl: file.url });
            router.push(`/publisher/listings/new/verify-business/submitted?doc=${encodeURIComponent(file?.name ?? "")}`);
        } catch (caught) {
            setProblem(messageOf(caught, "Could not submit your business details."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-[1384px]">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Verify your business</h1>
            <p className="mt-2 text-sm text-dim">Review your business details and supporting document before submitting.</p>
            {loaded.error && <div className="mt-4"><Problem>{loaded.error}</Problem></div>}
            {me?.kycStatus === "VERIFIED" && <div className="mt-4"><Note>Your business is already verified. Anything you change here is sent to ADX again.</Note></div>}

            <section className="mt-5 rounded-xl border border-line bg-white p-5">
                <h2 className="text-base font-semibold text-ink">Business and contact details</h2>
                <div className="mt-5 grid gap-x-5 gap-y-4 md:grid-cols-2">
                    <LabelledInput label="Business name" value={fields?.name ?? ""} onChange={(name) => put({ name })} placeholder="Metro Media" />
                    <LabelledInput label="Email address" type="email" value={fields?.email ?? ""} onChange={(email) => put({ email })} placeholder="hello@metromedia.example" />
                    <LabelledInput label="Contact name" value={fields?.contactName ?? ""} onChange={(contactName) => put({ contactName })} placeholder="Metro Media team" />
                    <LabelledInput label="Phone number" type="tel" value={maskMobile(me?.mobile)} readOnly />
                    <LabelledInput label="GST number (if applicable)" value={fields?.gstin ?? ""} onChange={(gstin) => put({ gstin })} placeholder="Enter GST number" />
                </div>
                <h3 className="mt-6 text-sm font-semibold text-ink">Business address</h3>
                <div className="mt-3 grid gap-x-5 gap-y-4 md:grid-cols-2">
                    <AddressFinder
                        id="verify-business-address"
                        className="md:col-span-2"
                        disabled={!fields}
                        onPlace={(place) => fillFromPlace(place, { address: (address) => put({ address }), city: (city) => put({ city }), state: (state) => put({ state }), postalCode: (postalCode) => put({ postalCode }), point: setPoint })}
                    />
                    <div className="md:col-span-2">
                        <LabelledInput label="Address" value={fields?.address ?? ""} onChange={(address) => put({ address })} placeholder={ADDRESS_LINE_PLACEHOLDER} />
                    </div>
                    <LabelledInput label="City" value={fields?.city ?? ""} onChange={(city) => put({ city })} placeholder="Bengaluru" />
                    <LabelledInput label="State" value={fields?.state ?? ""} onChange={(state) => put({ state })} placeholder="Karnataka" />
                    <LabelledInput label="PIN code" value={fields?.postalCode ?? ""} onChange={(postalCode) => put({ postalCode: postalCode.replace(/\D/g, "").slice(0, 6) })} placeholder={PIN_PLACEHOLDER} />
                </div>
            </section>

            <section className="mt-5 rounded-xl border border-line bg-white p-5">
                <h2 className="text-base font-semibold text-ink">Supporting business document</h2>
                <p className="mt-3 text-sm text-dim">Upload a clear document that identifies your business. We will contact you if additional information is needed.</p>
                <div className="mt-5">
                    <DropZone title="Drag & drop files here or click to browse" caption="Supported formats: PDF, JPG, PNG (max 10 MB)" accept="application/pdf,image/*" purpose="KYC" buttonLabel={null} ringed={false} max={10 * 1024 * 1024} onStored={setFile} className="min-h-[112px] bg-ground" />
                </div>
                <p className="mt-4 text-sm text-dim">You confirm that the information and document belong to this business.</p>
                {file && <FileRow file={file} status={{ label: "Ready to submit", tone: "success" }} onRemove={() => setFile(null)} className="mt-4" />}
                {!file && loaded.kyc?.businessRegCertUrl && <FileRow file={{ url: loaded.kyc.businessRegCertUrl, name: "business-registration (on file)" }} status={{ label: loaded.kyc.status === "VERIFIED" ? "Verified" : "In review", tone: loaded.kyc.status === "VERIFIED" ? "success" : "warning" }} className="mt-4" />}
                {problem && <div className="mt-4"><Problem>{problem}</Problem></div>}
            </section>

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/publisher" className="inline-flex h-10 items-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink hover:border-ink">
                    Back to setup
                </Link>
                <button type="button" onClick={() => void submit()} disabled={busy || !fields} className="inline-flex h-10 items-center rounded-md bg-brand px-6 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60">
                    {busy ? "Submitting…" : "Submit for review"}
                </button>
            </div>
        </div>
    );
}

/** 30 · Business details submitted (5204:82822). */
export function VerifyBusinessSubmitted({ documentName }: { documentName: string | null }) {
    const [me, setMe] = React.useState<PublisherProfile | null>(null);
    React.useEffect(() => {
        let cancelled = false;
        listingEditorService
            .publisher()
            .then((row) => {
                if (!cancelled) setMe(row);
            })
            .catch(() => toast.error("Could not read your business details."));
        return () => {
            cancelled = true;
        };
    }, []);
    const status = me?.kycStatus === "VERIFIED" ? "Verified" : me?.kycStatus === "REJECTED" ? "Not approved" : me?.kycStatus === "NEEDS_INFO" ? "More information asked" : "In review";
    return (
        <div className="mx-auto w-full max-w-[1384px]">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Business details submitted</h1>
            <p className="mt-2 text-sm text-dim">Your business verification is now in review.</p>
            <section className="mt-5 rounded-xl border border-line bg-white p-5">
                <h2 className="text-base font-semibold text-ink">What happens next</h2>
                <p className="mt-3 text-sm text-dim">ADX will review your business details and supporting document. If anything needs attention, you can return here to update it.</p>
                <dl className="mt-4 space-y-2.5 text-sm">
                    <div className="flex items-center justify-between gap-4">
                        <dt className="text-dim">Business</dt>
                        <dd className="font-medium text-ink">{me?.name ?? "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <dt className="text-dim">Verification status</dt>
                        <dd className="font-medium text-ink">{status}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <dt className="text-dim">Submitted document</dt>
                        <dd className="font-medium text-ink">{documentName || "On file"}</dd>
                    </div>
                </dl>
                <h2 className="mt-5 text-base font-semibold text-ink">Keep building your inventory</h2>
                <p className="mt-3 text-sm text-dim">You can create a listing now. Business verification and listing review have separate statuses.</p>
            </section>
            <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/publisher/listings/new" className="inline-flex h-10 items-center rounded-md bg-brand px-6 text-sm font-semibold text-white hover:bg-brand/90">
                    Create a listing
                </Link>
                <Link href="/publisher" className="inline-flex h-10 items-center rounded-md border border-line bg-white px-6 text-sm font-semibold text-ink hover:border-ink">
                    Back to setup
                </Link>
            </div>
        </div>
    );
}
