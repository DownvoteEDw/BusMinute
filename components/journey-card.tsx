import Link from "next/link";
import type { JourneyStopView, JourneyView } from "../src/application/journey-view";
import { journeyTimeAtStop } from "../src/application/station-schedule";

interface JourneyCardProps
{
    journey: JourneyView;
    stopId?: string;
    originStopId?: string;
    destinationStopId?: string;
}

export function JourneyCard({ journey, stopId, originStopId, destinationStopId }: JourneyCardProps)
{
    const event = journeyEvent(journey, stopId ?? originStopId, destinationStopId);
    const delaySeconds = event.stop?.delaySeconds ?? journey.delaySeconds;
    const delayState = journeyDelayState(journey, delaySeconds);
    const isStationContext = Boolean(stopId && !destinationStopId);
    const segmentOrigin = findStop(journey, originStopId);
    const segmentDestination = findStop(journey, destinationStopId);
    const originCity = segmentOrigin?.city ?? journey.originCity;
    const destinationCity = segmentDestination?.city ?? journey.destinationCity;

    return (
        <Link className={`journey-card${isStationContext ? ` is-station is-${delayState}` : ""}`} href={`/suivi/${encodeURIComponent(journey.journeyRef)}`}>
            <div className="journey-card-time">
                <time dateTime={event.time ?? undefined}>{formatTime(event.time)}</time>
                <span>{event.label}</span>
            </div>
            <div className="journey-card-body">
                <div className="journey-card-head">
                    <span>{journey.operatorName} · Bus {journey.serviceNumber}</span>
                    <span className={`journey-status ${journey.status}`}><i /> {journey.realtimeAvailable ? statusLabel(journey.status) : "Horaire prévu"}</span>
                </div>
                <h2>{originCity} <span>→</span> {destinationCity}</h2>
                <p>{event.detail}</p>
            </div>
            <div className={`journey-card-delay ${delayState}`}>
                <strong>{delayLabel(delaySeconds, delayState)}</strong>
                <span>{delayDetail(delayState)}</span>
            </div>
            <span className="journey-card-arrow" aria-hidden="true">›</span>
        </Link>
    );
}

function journeyEvent(
    journey: JourneyView,
    stopId: string | undefined,
    destinationStopId: string | undefined
): { stop: JourneyStopView | undefined; time: string | null; label: string; detail: string }
{
    const stopIndex = stopId
        ? journey.stops.findIndex((stop) => stop.stopId.toLocaleLowerCase("fr") === stopId.toLocaleLowerCase("fr"))
        : 0;
    const resolvedIndex = stopIndex >= 0 ? stopIndex : 0;
    const stop = journey.stops[resolvedIndex];
    const isPassed = stop?.phase === "passed";
    const time = stopId
        ? journeyTimeAtStop(journey, stop?.stopId ?? stopId)
        : isPassed
            ? stop?.actualDepartureAt ?? stop?.actualArrivalAt ?? plannedTime(stop)
            : plannedTime(stop) ?? stop?.actualDepartureAt ?? stop?.actualArrivalAt ?? null;

    if (destinationStopId)
    {
        const destination = findStop(journey, destinationStopId);
        const continuation = destination && destination.stopId !== journey.destinationStopId
            ? ` · Continue vers ${journey.destinationCity}`
            : "";

        return {
            stop,
            time,
            label: "Départ",
            detail: `Arrivée ${formatTime(plannedTime(destination))} à ${destination?.city ?? destinationStopId}${continuation}`
        };
    }

    if (!stopId)
    {
        return {
            stop,
            time,
            label: "Départ",
            detail: `${formatDate(journey.serviceDate)} · ${journey.originName}`
        };
    }

    const label = resolvedIndex === 0
        ? "Départ"
        : resolvedIndex === journey.stops.length - 1
            ? "Arrivée"
            : "Passage";

    return {
        stop,
        time,
        label,
        detail: stop?.name ?? stopId
    };
}

function findStop(journey: JourneyView, stopId: string | undefined): JourneyStopView | undefined
{
    if (!stopId)
    {
        return undefined;
    }

    return journey.stops.find((stop) => stop.stopId.toLocaleLowerCase("fr") === stopId.toLocaleLowerCase("fr"));
}

function plannedTime(stop: JourneyStopView | undefined): string | null
{
    return stop?.expectedDepartureAt
        ?? stop?.aimedDepartureAt
        ?? stop?.expectedArrivalAt
        ?? stop?.aimedArrivalAt
        ?? null;
}

function formatTime(value: string | null): string
{
    if (!value)
    {
        return "—";
    }

    return new Intl.DateTimeFormat("fr-FR",
    {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Paris"
    }).format(new Date(value));
}

function formatDate(value: string): string
{
    return new Intl.DateTimeFormat("fr-FR",
    {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}

function statusLabel(status: JourneyView["status"]): string
{
    const labels = {
        scheduled: "À venir",
        in_transit: "En route",
        arrived: "Terminé",
        cancelled: "Annulé"
    };
    return labels[status];
}

function delayLabel(seconds: number | null, state: DelayState): string
{
    if (state === "cancelled")
    {
        return "Annulé";
    }

    if (seconds === null)
    {
        return "Prévu";
    }

    const minutes = Math.round(seconds / 60);

    if (Math.abs(minutes) < 5)
    {
        return "À l'heure";
    }

    return minutes > 0 ? `+${minutes} min` : `${Math.abs(minutes)} min d'avance`;
}

type DelayState = "scheduled" | "on-time" | "late" | "early" | "cancelled";

function journeyDelayState(journey: JourneyView, seconds: number | null): DelayState
{
    if (journey.cancelled || journey.status === "cancelled")
    {
        return "cancelled";
    }

    if (seconds === null)
    {
        return "scheduled";
    }

    if (Math.abs(seconds) < 300)
    {
        return "on-time";
    }

    return seconds > 0 ? "late" : "early";
}

function delayDetail(state: DelayState): string
{
    const labels: Record<DelayState, string> = {
        scheduled: "Sans suivi en temps réel",
        "on-time": "Moins de 5 min d’écart",
        late: "Retard estimé",
        early: "Avance estimée",
        cancelled: "Bus annulé"
    };
    return labels[state];
}
