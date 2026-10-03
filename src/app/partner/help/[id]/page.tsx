"use client";

import { useParams } from "next/navigation";
import { TicketThreadView } from "@/components/support/ticket-thread";

/** One ticket's thread — or, when it is a live chat, the chat. */
export default function PartnerTicketPage() {
    const { id } = useParams<{ id: string }>();
    return <TicketThreadView key={id} party="PRINT_PARTNER" ticketId={id} />;
}
