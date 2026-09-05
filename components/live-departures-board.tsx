"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { localeTag, localize, type Locale } from "../src/application/i18n";
import type { JourneyStopView, JourneyView } from "../src/application/journey-view";
import { OperatorLogo } from "./operator-logo";

interface LiveDeparturesBoardProps
{
    initialJourneys: JourneyView[];
    locale?: Locale;
}

interface BoardResponse
{
    journeys?: JourneyView[];
    updatedAt?: string | null;
}

export function LiveDeparturesBoard({ initialJourneys, locale = "fr" }: LiveDeparturesBoardProps)
{
    const [journeys, setJourneys] = useState(initialJourneys);
    const [updatedAt, setUpdatedAt] = useState(latestUpdate(initialJourneys));

    useEffect(() =>
    {
        const refresh = async (): Promise<void> =>
        {
            try
            {
                const response = await fetch("/api/board", { cache: "no-store" });

                if (!response.ok)
                {
                    return;
                }

                const data = await response.json() as BoardResponse;

                if (data.journeys)
                {
                    setJourneys(data.journeys);
                    setUpdatedAt(data.updatedAt ?? latestUpdate(data.journeys));
                }
            }
            catch
            {
            }
        };
        const interval = window.setInterval(refresh, 30_000);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <section className="station-board" aria-labelledby="station-board-title">
            <header className="station-board-header">
                <div>
                    <span className="station-board-live"><i /> {localize(locale, "Panneau des bus en temps réel", "Live bus departures")}</span>
                    <h2 id="station-board-title">{localize(locale, "Prochains bus", "Next buses")}</h2>
                </div>
                <time dateTime={updatedAt ?? undefined}>{formatUpdatedAt(updatedAt, locale)}</time>
            </header>
            <div className="station-board-columns" aria-hidden="true">
                <span>{localize(locale, "Passage", "Time")}</span>
                <span>Bus</span>
                <span>{localize(locale, "Trajet", "Route")}</span>
                <span>{localize(locale, "État", "Status")}</span>
                <span />
            </div>
            <div className="station-board-rows" aria-live="polite">
                {journeys.length === 0 ? (
                    <div className="station-board-empty">
                        <strong>{localize(locale, "En attente du prochain passage", "Waiting for the next service")}</strong>
                        <span>{localize(locale, "Les horaires seront actualisés automatiquement.", "Times will update automatically.")}</span>
                    </div>
                ) : journeys.map((journey) =>
                {
                    const event = boardEvent(journey, locale);

                    return (
                        <Link
                            className="station-board-row"
                            href={`/suivi/${encodeURIComponent(journey.journeyRef)}`}
                            key={journey.journeyRef}
                        >
                            <time dateTime={event.time ?? undefined}>{formatTime(event.time, locale)}</time>
                            <span className="station-board-service">
                                <strong>{journey.serviceNumber}</strong>
                                <OperatorLogo operatorSlug={journey.operatorSlug} />
                            </span>
                            <span className="station-board-route">
                                <strong>{journey.originCity} <i>→</i> {journey.destinationCity}</strong>
                                <small>{event.label}</small>
                            </span>
                            <span className={`station-board-status ${statusTone(journey)}`}>{statusLabel(journey, locale)}</span>
                            <span className="station-board-arrow" aria-hidden="true">›</span>
                        </Link>
                    );
                })}
            </div>
            <footer>
                <span>{localize(locale, "Retards BlaBlaCar Bus et FlixBus en temps réel", "Live BlaBlaCar Bus and FlixBus delays")}</span>
                <span>{localize(locale, "Actualisation automatique · 30 s", "Automatic refresh · 30 sec")}</span>
            </footer>
        </section>
    );
}

function boardEvent(journey: JourneyView, locale: Locale): { time: string | null; label: string }
{
    if (journey.status === "scheduled")
    {
        const origin = journey.stops[0];
        return {
            time: stopTime(origin),
            label: `${localize(locale, "Départ", "Departure")} · ${origin?.name ?? journey.originName}`
        };
    }

    if (journey.status === "arrived")
    {
        const destination = journey.stops[journey.stops.length - 1];
        return {
            time: stopTime(destination),
            label: `${localize(locale, "Arrivée", "Arrival")} · ${destination?.name ?? journey.destinationName}`
        };
    }

    const nextStop = journey.stops.find((stop) => stop.phase === "current")
        ?? journey.stops.find((stop) => stop.phase === "upcoming")
        ?? journey.stops[journey.stops.length - 1];
    return {
        time: stopTime(nextStop),
        label: `${localize(locale, "Prochain arrêt", "Next stop")} · ${nextStop?.name ?? journey.destinationName}`
    };
}

function stopTime(stop: JourneyStopView | undefined): string | null
{
    return stop?.expectedDepartureAt
        ?? stop?.aimedDepartureAt
        ?? stop?.expectedArrivalAt
        ?? stop?.aimedArrivalAt
        ?? stop?.actualArrivalAt
        ?? stop?.actualDepartureAt
        ?? null;
}

function statusLabel(journey: JourneyView, locale: Locale): string
{
    if (journey.cancelled || journey.status === "cancelled")
    {
        return localize(locale, "Annulé", "Cancelled");
    }

    if (journey.status === "arrived")
    {
        return localize(locale, "Arrivé", "Arrived");
    }

    if (journey.delaySeconds === null)
    {
        return journey.status === "in_transit"
            ? localize(locale, "En route", "En route")
            : localize(locale, "À venir", "Upcoming");
    }

    const minutes = Math.round(journey.delaySeconds / 60);

    if (Math.abs(minutes) < 5)
    {
        return journey.status === "in_transit"
            ? localize(locale, "En route", "En route")
            : localize(locale, "À l’heure", "On time");
    }

    return minutes > 0
        ? `+${minutes} min`
        : localize(locale, `${Math.abs(minutes)} min d’avance`, `${Math.abs(minutes)} min early`);
}

function statusTone(journey: JourneyView): string
{
    if (journey.cancelled || journey.status === "cancelled")
    {
        return "is-cancelled";
    }

    if (journey.status === "arrived")
    {
        return "is-arrived";
    }

    if (journey.delaySeconds !== null && journey.delaySeconds >= 300)
    {
        return "is-late";
    }

    return journey.status === "in_transit" ? "is-live" : "is-scheduled";
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

function formatUpdatedAt(value: string | null, locale: Locale): string
{
    if (!value)
    {
        return localize(locale, "En attente des données", "Waiting for data");
    }

    return `${localize(locale, "Mis à jour", "Updated")} ${new Intl.DateTimeFormat(localeTag(locale),
    {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Europe/Paris"
    }).format(new Date(value))}`;
}

function latestUpdate(journeys: JourneyView[]): string | null
{
    return journeys.reduce<string | null>((latest, journey) =>
    {
        if (!latest || new Date(journey.updatedAt) > new Date(latest))
        {
            return journey.updatedAt;
        }

        return latest;
    }, null);
}
