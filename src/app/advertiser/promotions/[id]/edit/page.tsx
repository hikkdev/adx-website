"use client";

import { useParams } from "next/navigation";
import { AdFormPage } from "@/components/promotions/ads/ad-form-page";

/** LM-1: edit a draft or a turned-down ad — the same form as "Book an ad". */
export default function EditAdPage() {
    const params = useParams<{ id: string }>();
    return <AdFormPage editId={params.id} />;
}
