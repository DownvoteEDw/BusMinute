"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { JourneyStopView, JourneyView } from "../src/application/journey-view";
import { OperatorLogo } from "./operator-logo";

interface LiveDeparturesBoardProps
{
    initialJourneys: JourneyView[];
}

interface BoardResponse
{
    journeys?: JourneyView[];
    updatedAt?: string | null;
}

export function LiveDeparturesBoard({ initialJourneys }: LiveDeparturesBoardProps)
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
                    <span className="station-board-live"><i /> Panneau des bus en temps réel</span>
                    <h2 id="station-board-title">Prochains bus</h2>
                </div>
                <time dateTime={updatedAt ?? undefined}>{formatUpdatedAt(updatedAt)}</time>
            </header>
            <div className="station-board-columns" aria-hidden="true">
                <span>Passage</span>
                <span>Bus</span>
                <span>Trajet</span>
                <span>État</span>
                <span />
            </div>
            <div className="station-board-rows" aria-live="polite">
                {journeys.length === 0 ? (
                    <div className="station-board-empty">
                        <strong>En attente du prochain passage</strong>
                        <span>Les horaires seront actualisés automatiquement.</span>
                    </div>
                ) : journeys.map((journey) =>
                {
                    const event = boardEvent(journey);

                    return (
                        <Link
                            className="station-board-row"
                            href={`/suivi/${encodeURIComponent(journey.journeyRef)}`}
                            key={journey.journeyRef}
                        >
                            <time dateTime={event.time ?? undefined}>{formatTime(event.time)}</time>
                            <span className="station-board-service">
                                <strong>{journey.serviceNumber}</strong>
                                <OperatorLogo operatorSlug={journey.operatorSlug} />
                            </span>
                            <span className="station-board-route">
                                <strong>{journey.originCity} <i>→</i> {journey.destinationCity}</strong>
                                <small>{event.label}</small>
                            </span>
                            <span className={`station-board-status ${statusTone(journey)}`}>{statusLabel(journey)}</span>
                            <span className="station-board-arrow" aria-hidden="true">›</span>
                        </Link>
                    );
                })}
            </div>
            <footer>
                <span>Retards BlaBlaCar Bus en temps réel · horaires officiels FlixBus</span>
                <span>Actualisation automatique · 30 s</span>
            </footer>
        </section>
    );
}

function boardEvent(journey: JourneyView): { time: string | null; label: string }
{
    if (journey.status === "scheduled")
    {
        const origin = journey.stops[0];
        return {
            time: stopTime(origin),
            label: `Départ · ${origin?.name ?? journey.originName}`
        };
    }

    if (journey.status === "arrived")
    {
        const destination = journey.stops[journey.stops.length - 1];
        return {
            time: stopTime(destination),
            label: `Arrivée · ${destination?.name ?? journey.destinationName}`
        };
    }

    const nextStop = journey.stops.find((stop) => stop.phase === "current")
        ?? journey.stops.find((stop) => stop.phase === "upcoming")
        ?? journey.stops[journey.stops.length - 1];
    return {
        time: stopTime(nextStop),
        label: `Prochain arrêt · ${nextStop?.name ?? journey.destinationName}`
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

function statusLabel(journey: JourneyView): string
{
    if (journey.cancelled || journey.status === "cancelled")
    {
        return "Annulé";
    }

    if (journey.status === "arrived")
    {
        return "Arrivé";
    }

    if (journey.delaySeconds === null)
    {
        return journey.status === "in_transit" ? "En route" : "À venir";
    }

    const minutes = Math.round(journey.delaySeconds / 60);

    if (Math.abs(minutes) < 5)
    {
        return journey.status === "in_transit" ? "En route" : "À l’heure";
    }

    return minutes > 0 ? `+${minutes} min` : `${Math.abs(minutes)} min d’avance`;
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

function formatUpdatedAt(value: string | null): string
{
    if (!value)
    {
        return "En attente des données";
    }

    return `Mis à jour ${new Intl.DateTimeFormat("fr-FR",
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
