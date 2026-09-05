import Link from "next/link";
import { journeyPath } from "../src/application/journey-url";
import { OperatorLogo } from "./operator-logo";
import { localeTag, localize, type Locale } from "../src/application/i18n";
import type { JourneyStopView, JourneyView } from "../src/application/journey-view";
import { journeyTimeAtStop } from "../src/application/station-schedule";

interface JourneyCardProps
{
    journey: JourneyView;
    stopId?: string;
    originStopId?: string;
    destinationStopId?: string;
    locale?: Locale;
}

export function JourneyCard({ journey, stopId, originStopId, destinationStopId, locale = "fr" }: JourneyCardProps)
{
    const event = journeyEvent(journey, stopId ?? originStopId, destinationStopId, locale);
    const delaySeconds = event.stop?.delaySeconds ?? journey.delaySeconds;
    const delayState = journeyDelayState(journey, delaySeconds);
    const isStationContext = Boolean(stopId && !destinationStopId);
    const segmentOrigin = findStop(journey, originStopId);
    const segmentDestination = findStop(journey, destinationStopId);
    const originCity = segmentOrigin?.city ?? journey.originCity;
    const destinationCity = segmentDestination?.city ?? journey.destinationCity;

    return (
        <Link className={`journey-card${isStationContext ? ` is-station is-${delayState}` : ""}`} href={journeyPath(journey.journeyRef)}>
            <div className="journey-card-time">
                <time dateTime={event.time ?? undefined}>{formatTime(event.time, locale)}</time>
                <span>{event.label}</span>
            </div>
            <div className="journey-card-body">
                <div className="journey-card-head">
                    <span className="journey-card-operator">
                        <OperatorLogo operatorSlug={journey.operatorSlug} />
                        <b>Bus {journey.serviceNumber}</b>
                    </span>
                    <span className={`journey-status ${journey.status}`}><i /> {journey.realtimeObserved ? statusLabel(journey.status, locale) : localize(locale, "Horaire prévu", "Scheduled")}</span>
                </div>
                <h2>{originCity} <span>→</span> {destinationCity}</h2>
                <p>{event.detail}</p>
            </div>
            <div className={`journey-card-delay ${delayState}`}>
                <strong>{delayLabel(delaySeconds, delayState, locale)}</strong>
                <span>{delayDetail(delayState, locale)}</span>
            </div>
            <span className="journey-card-arrow" aria-hidden="true">›</span>
        </Link>
    );
}

function journeyEvent(
    journey: JourneyView,
    stopId: string | undefined,
    destinationStopId: string | undefined,
    locale: Locale
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
            ? localize(locale, ` · Continue vers ${journey.destinationCity}`, ` · Continues to ${journey.destinationCity}`)
            : "";

        return {
            stop,
            time,
            label: localize(locale, "Départ", "Departure"),
            detail: localize(
                locale,
                `Arrivée ${formatTime(plannedTime(destination), locale)} à ${destination?.city ?? destinationStopId}${continuation}`,
                `Arrival ${formatTime(plannedTime(destination), locale)} in ${destination?.city ?? destinationStopId}${continuation}`
            )
        };
    }

    if (!stopId)
    {
        return {
            stop,
            time,
            label: localize(locale, "Départ", "Departure"),
            detail: `${formatDate(journey.serviceDate, locale)} · ${journey.originName}`
        };
    }

    const label = resolvedIndex === 0
        ? localize(locale, "Départ", "Departure")
        : resolvedIndex === journey.stops.length - 1
            ? localize(locale, "Arrivée", "Arrival")
            : localize(locale, "Passage", "Calling");

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

function formatTime(value: string | null, locale: Locale): string
{
    if (!value)
    {
        return "—";
    }

    return new Intl.DateTimeFormat(localeTag(locale),
    {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Paris"
    }).format(new Date(value));
}

function formatDate(value: string, locale: Locale): string
{
    return new Intl.DateTimeFormat(localeTag(locale),
    {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}

function statusLabel(status: JourneyView["status"], locale: Locale): string
{
    const labels = {
        scheduled: localize(locale, "À venir", "Upcoming"),
        in_transit: localize(locale, "En route", "En route"),
        arrived: localize(locale, "Terminé", "Completed"),
        cancelled: localize(locale, "Annulé", "Cancelled")
    };
    return labels[status];
}

function delayLabel(seconds: number | null, state: DelayState, locale: Locale): string
{
    if (state === "cancelled")
    {
        return localize(locale, "Annulé", "Cancelled");
    }

    if (seconds === null)
    {
        return localize(locale, "Prévu", "Scheduled");
    }

    const minutes = Math.round(seconds / 60);

    if (Math.abs(minutes) < 5)
    {
        return localize(locale, "À l'heure", "On time");
    }

    return minutes > 0
        ? `+${minutes} min`
        : localize(locale, `${Math.abs(minutes)} min d'avance`, `${Math.abs(minutes)} min early`);
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

function delayDetail(state: DelayState, locale: Locale): string
{
    const labels: Record<DelayState, string> = {
        scheduled: localize(locale, "Sans suivi en temps réel", "No live tracking"),
        "on-time": localize(locale, "Moins de 5 min d’écart", "Less than 5 min difference"),
        late: localize(locale, "Retard estimé", "Estimated delay"),
        early: localize(locale, "Avance estimée", "Running early"),
        cancelled: localize(locale, "Bus annulé", "Bus cancelled")
    };
    return labels[state];
}
