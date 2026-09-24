"use client";

import * as React from "react";
import { ApiError } from "@/lib/api-client";
import { listingEditorService, normalisePlate, shortDate, type VehicleRcCheck } from "@/services/listing-editor";
import { cn } from "@/lib/utils";

/**
 * VH-3: "Is this my vehicle?" — the check beside the registration. Before
 * a listing exists it is `POST /listings/vehicle-rc/check`; on a listing it
 * is `POST /listings/:id/vehicle-rc/verify`, which records the answer.
 * Could-not-check is not failed: the register sits behind a vendor that
 * may refuse, and a publisher in their own yard is not stopped by that.
 */
export function VehicleVerify({ value, listingId }: { value: string; listingId: string | null }) {
    const [busy, setBusy] = React.useState(false);
    const [answer, setAnswer] = React.useState<VehicleRcCheck | null>(null);
    const [problem, setProblem] = React.useState<string | null>(null);
    const plate = normalisePlate(value);
    const ready = plate.length >= 4 && !busy;

    const check = async () => {
        if (!ready) return;
        setBusy(true);
        setProblem(null);
        setAnswer(null);
        try {
            if (listingId) {
                const result = await listingEditorService.verifyListingVehicleRc(listingId, plate);
                const facts = result.verification.facts as Record<string, string | boolean | null | undefined>;
                setAnswer({
                    vehicleNumber: plate,
                    via: result.verification.via,
                    nameMatch: result.verification.nameMatch,
                    publisherName: null,
                    vehicle: {
                        maker: (facts.maker as string) ?? null,
                        model: (facts.model as string) ?? null,
                        vehicleClass: (facts.vehicleClass as string) ?? null,
                        rcStatus: (facts.rcStatus as string) ?? (facts.status as string) ?? null,
                        blacklisted: (facts.blacklisted as boolean) ?? null,
                        insuranceValidUntil: (facts.insuranceValidUntil as string) ?? null,
                        fitnessValidUntil: (facts.fitnessValidUntil as string) ?? null,
                        pucValidUntil: (facts.pucValidUntil as string) ?? null,
                    },
                });
            } else {
                setAnswer(await listingEditorService.checkVehicleRc(plate));
            }
        } catch (caught) {
            setProblem(caught instanceof ApiError ? `Could not check it: ${caught.message}` : "Could not reach the vehicle register.");
        } finally {
            setBusy(false);
        }
    };

    const match = answer?.nameMatch ?? null;
    const tone = match === null ? "neutral" : match >= 70 ? "good" : match >= 40 ? "look" : "low";

    return (
        <div className="flex flex-wrap items-center gap-3 pl-1">
            <button type="button" onClick={check} disabled={!ready} className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-ink hover:border-ink disabled:opacity-50">
                {busy ? "Checking…" : "Verify against the RC"}
            </button>
            {problem && <span className="text-xs text-dim">{problem} You can still continue.</span>}
            {answer && (
                <span className={cn("text-xs", tone === "good" ? "text-success" : tone === "look" ? "text-warning" : tone === "low" ? "text-danger" : "text-dim")}>
                    {match === null ? "Register named no owner to compare." : `Owner name ${match}% match to your business.`}
                    {answer.vehicle.maker || answer.vehicle.model ? ` ${[answer.vehicle.maker, answer.vehicle.model].filter(Boolean).join(" ")}.` : ""}
                    {answer.vehicle.rcStatus ? ` RC ${answer.vehicle.rcStatus.toLowerCase()}.` : ""}
                    {answer.vehicle.fitnessValidUntil ? ` Fitness to ${shortDate(answer.vehicle.fitnessValidUntil)}.` : ""}
                    {answer.vehicle.blacklisted ? " Blacklisted on the register." : ""}
                </span>
            )}
        </div>
    );
}
