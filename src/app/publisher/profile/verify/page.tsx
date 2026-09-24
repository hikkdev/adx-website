"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/workspace/page-heading";
import { brandButton, CardTitle, Chip, ErrorNote, Field, inputClass, Loading, outlineButton } from "@/components/publisher/parts";
import { UploadBox } from "@/components/publisher/upload-box";
import { useLoad } from "@/components/publisher/use-load";
import { ApiError, messageOf } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { KYC_DOCUMENTS, kycLabel, longDate, publisherWorkspace, type KycSubmission, type PublisherKyc, type PublisherProfile, type UploadedFile } from "@/services/publisher-workspace";

const TYPES: { value: string; label: string }[] = [
    { value: "INDIVIDUAL", label: "Individual" },
    { value: "BUSINESS", label: "Business" },
    { value: "NGO", label: "NGO or trust" },
    { value: "POLITICAL", label: "Political organisation" },
];

async function readVerification(): Promise<{ profile: PublisherProfile; kyc: PublisherKyc | null }> {
    const [profile, kyc] = await Promise.all([publisherWorkspace.profile(), publisherWorkspace.kyc().catch(() => null)]);
    return { profile, kyc };
}

/**
 * Verify your business — the DR 08 ladder on the web: business and contact
 * details (`PATCH /publishers/me`), the supporting documents (`POST /upload`
 * under KYC, then `POST /publishers/me/kyc`), and where the review stands.
 */
export default function VerifyPage() {
    const { refresh } = useAuth();
    const { data, error, loading, reload } = useLoad("verify", readVerification);

    if (!data && loading) return <Loading label="Loading your verification…" />;
    if (!data) return <ErrorNote message={error ?? "Could not read your profile."} onRetry={reload} />;

    const status = data.kyc?.status ?? data.profile.kycStatus;
    const words = kycLabel(data.kyc ? status : data.kyc === null && data.profile.kycStatus === "PENDING" ? "NOT_STARTED" : status);
    const verified = status === "VERIFIED";

    return (
        <>
            <Link href="/publisher/profile" className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden />
                Business profile
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">Verify your business</h1>
                <Chip tone={words.tone}>{words.label}</Chip>
            </div>
            <p className="mt-1 text-sm text-dim">Business and contact details, then the documents ADX checks. Verification usually takes one working day.</p>

            {data.kyc && (
                <div className={cn("mt-6 rounded-lg px-4 py-3 text-sm", verified ? "bg-success-soft text-success" : status === "REJECTED" ? "bg-danger-soft text-danger" : status === "NEEDS_INFO" ? "bg-warning-soft text-warning" : "bg-info-soft text-info")}>
                    {verified && `Verified${data.kyc.reviewedAt ? ` on ${longDate(data.kyc.reviewedAt)}` : ""}. Nothing more is needed.`}
                    {status === "PENDING" && `Submitted${data.kyc.submittedAt ? ` on ${longDate(data.kyc.submittedAt)}` : ""} · ADX is reviewing your documents.`}
                    {status === "REJECTED" && `Not approved${data.kyc.rejectionReason ? `: ${data.kyc.rejectionReason}` : ""}. Correct the documents below and submit again.`}
                    {status === "NEEDS_INFO" && `ADX needs more from you${data.kyc.rejectionReason ?? data.kyc.reviewNote ? `: ${data.kyc.rejectionReason ?? data.kyc.reviewNote}` : ""}. Upload the documents asked for and submit again.`}
                </div>
            )}

            <DetailsForm
                profile={data.profile}
                onSaved={() => {
                    reload();
                    void refresh();
                }}
            />
            <DocumentsForm kyc={data.kyc} locked={verified} onSubmitted={reload} />
        </>
    );
}

function DetailsForm({ profile, onSaved }: { profile: PublisherProfile; onSaved: () => void }) {
    const [form, setForm] = React.useState({
        name: profile.name ?? "",
        type: profile.type ?? "BUSINESS",
        gstin: profile.gstin ?? "",
        address: profile.address ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        contactName: profile.contactName ?? "",
        contactMobile: profile.contactMobile ?? "",
        contactEmail: profile.contactEmail ?? "",
    });
    const [busy, setBusy] = React.useState(false);
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
    const individual = form.type === "INDIVIDUAL";

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrors({});
        const patch: Record<string, string> = { name: form.name.trim(), type: form.type };
        for (const key of ["gstin", "address", "city", "state", "contactName", "contactMobile", "contactEmail"] as const) {
            const value = form[key].trim();
            if (value) patch[key] = key === "gstin" ? value.toUpperCase() : value;
        }
        if (!patch.name) return setErrors({ name: "The business name is needed." });
        setBusy(true);
        try {
            await publisherWorkspace.updateProfile(patch);
            toast.success("Business details saved");
            onSaved();
        } catch (caught) {
            if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
                setErrors(Object.fromEntries(Object.entries(caught.fieldErrors).map(([key, messages]) => [key, messages[0] ?? "Check this field"])));
            } else toast.error(messageOf(caught, "Could not save the details."));
        } finally {
            setBusy(false);
        }
    };

    const note = (key: string) => errors[key] && <p className="mt-1 text-xs text-danger">{errors[key]}</p>;

    return (
        <form onSubmit={save}>
            <Panel className="mt-6">
                <CardTitle>Business details</CardTitle>
                <p className="mt-1 text-sm text-dim">As they appear on your registration and tax documents.</p>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <Field label="Business name" htmlFor="v-name">
                        <input id="v-name" value={form.name} onChange={set("name")} className={inputClass} autoComplete="organization" />
                        {note("name")}
                    </Field>
                    <Field label="Business type" htmlFor="v-type">
                        <select id="v-type" value={form.type} onChange={set("type")} className={inputClass}>
                            {TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="GSTIN" htmlFor="v-gstin" hint={individual ? "optional" : "needed for a business"}>
                        <input id="v-gstin" value={form.gstin} onChange={set("gstin")} className={cn(inputClass, "uppercase")} placeholder="29ABCDE1234F1Z5" maxLength={15} />
                        {note("gstin")}
                    </Field>
                    <Field label="Registered address" htmlFor="v-address">
                        <input id="v-address" value={form.address} onChange={set("address")} className={inputClass} autoComplete="street-address" />
                        {note("address")}
                    </Field>
                    <Field label="City" htmlFor="v-city">
                        <input id="v-city" value={form.city} onChange={set("city")} className={inputClass} autoComplete="address-level2" />
                        {note("city")}
                    </Field>
                    <Field label="State" htmlFor="v-state">
                        <input id="v-state" value={form.state} onChange={set("state")} className={inputClass} autoComplete="address-level1" />
                        {note("state")}
                    </Field>
                </div>
            </Panel>
            <Panel className="mt-6">
                <CardTitle>Contact person</CardTitle>
                <p className="mt-1 text-sm text-dim">Who ADX should reach about bookings and installations{individual ? " — optional for an individual" : ""}.</p>
                <div className="mt-5 grid gap-5 md:grid-cols-3">
                    <Field label="Name" htmlFor="v-cname">
                        <input id="v-cname" value={form.contactName} onChange={set("contactName")} className={inputClass} autoComplete="name" />
                        {note("contactName")}
                    </Field>
                    <Field label="Mobile" htmlFor="v-cmobile">
                        <input id="v-cmobile" value={form.contactMobile} onChange={set("contactMobile")} className={inputClass} placeholder="+91 98765 43210" autoComplete="tel" />
                        {note("contactMobile")}
                    </Field>
                    <Field label="Email" htmlFor="v-cemail">
                        <input id="v-cemail" type="email" value={form.contactEmail} onChange={set("contactEmail")} className={inputClass} autoComplete="email" />
                        {note("contactEmail")}
                    </Field>
                </div>
                <div className="mt-5">
                    <button type="submit" disabled={busy} className={brandButton}>
                        {busy ? "Saving…" : "Save details"}
                    </button>
                </div>
            </Panel>
        </form>
    );
}

function DocumentsForm({ kyc, locked, onSubmitted }: { kyc: PublisherKyc | null; locked: boolean; onSubmitted: () => void }) {
    const [files, setFiles] = React.useState<Partial<Record<keyof KycSubmission, UploadedFile | null>>>({});
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    const fresh = Object.entries(files).filter(([, file]) => file) as [keyof KycSubmission, UploadedFile][];
    const stored = (key: keyof KycSubmission) => kyc?.[key] ?? null;
    const anyStored = KYC_DOCUMENTS.some((doc) => stored(doc.key));

    const submit = async () => {
        if (fresh.length === 0) return setFailure("Upload at least one document to submit.");
        setBusy(true);
        setFailure(null);
        try {
            await publisherWorkspace.submitKyc(Object.fromEntries(fresh.map(([key, file]) => [key, file.url])) as KycSubmission);
            toast.success("Submitted for review");
            setFiles({});
            onSubmitted();
        } catch (caught) {
            setFailure(messageOf(caught, "Could not submit the documents."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Panel className="mt-6">
            <CardTitle>Supporting documents</CardTitle>
            <p className="mt-1 text-sm text-dim">JPG, PNG or PDF, up to 10MB each. Documents are stored privately and read only by ADX's reviewers.</p>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
                {KYC_DOCUMENTS.map((doc) => {
                    const existing = stored(doc.key);
                    return (
                        <div key={doc.key}>
                            <p className="text-sm font-medium text-ink">{doc.label}</p>
                            <p className="text-xs text-dim">{doc.hint}</p>
                            {existing && !files[doc.key] && (
                                <p className="mt-2 text-xs text-success">
                                    On file{kyc?.submittedAt ? ` · ${longDate(kyc.submittedAt)}` : ""}
                                    {!locked && " · upload again to replace"}
                                </p>
                            )}
                            {!locked && <UploadBox className="mt-2" purpose="KYC" label={existing ? "Replace document" : "Browse files"} hint="JPG, PNG or PDF" value={files[doc.key] ?? null} onChange={(file) => setFiles((current) => ({ ...current, [doc.key]: file }))} />}
                        </div>
                    );
                })}
            </div>
            {failure && (
                <p role="alert" className="mt-4 text-sm text-danger">
                    {failure}
                </p>
            )}
            {!locked && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={submit} disabled={busy || fresh.length === 0} className={brandButton}>
                        {busy ? "Submitting…" : anyStored ? "Submit again for review" : "Submit for review"}
                    </button>
                    <Link href="/publisher/profile" className={outlineButton}>
                        Back to profile
                    </Link>
                    <p className="text-xs text-dim">
                        {fresh.length} new document{fresh.length === 1 ? "" : "s"} ready
                    </p>
                </div>
            )}
        </Panel>
    );
}
