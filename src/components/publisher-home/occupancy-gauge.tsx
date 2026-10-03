import { gaugeArc, occupancyLine } from "./home-model";

/**
 * DR 01's occupancy gauge: a half ring filled by the share of live spaces a
 * booking covers today, computed on the server. With nothing live there is
 * no rate, and the gauge says "—" rather than 0%.
 */
export function OccupancyGauge({ rate, occupancy }: { rate: number | null; occupancy: { occupied: number; live: number } | null }) {
    return (
        <div className="relative mx-auto w-[220px]" role="img" aria-label={rate === null ? "Occupancy rate: no live spaces yet" : `Occupancy rate ${rate}%`}>
            <svg viewBox="0 0 200 110" className="h-auto w-full" aria-hidden>
                <path d={gaugeArc(100)} stroke="#ececef" strokeWidth={20} fill="none" strokeLinecap="round" />
                {rate !== null && rate > 0 && <path d={gaugeArc(rate)} stroke="#bd2020" strokeWidth={20} fill="none" strokeLinecap="round" />}
            </svg>
            <div className="absolute inset-x-0 top-[52%] text-center">
                <p className="text-[28px] font-semibold leading-none tabular-nums text-ink">{rate === null ? "—" : `${rate}%`}</p>
                <p className="mt-1.5 text-xs text-dim">Occupancy rate</p>
            </div>
            {occupancy && <p className="mt-3 text-center text-xs text-dim">{occupancyLine(occupancy)}</p>}
        </div>
    );
}
