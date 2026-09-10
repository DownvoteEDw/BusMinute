"use client";

import Link from "next/link";
import { journeyPath } from "../src/application/journey-url";
import { useEffect, useState } from "react";
import { localeTag, localize, type Locale } from "../src/application/i18n";
import { liveBoardEvent, type LiveBoardEventType } from "../src/application/live-board";
import type { JourneyView } from "../src/application/journey-view";
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
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = async (): Promise<void> =>
        {
            try
            {
                const response = await fetch("/api/board", { cache: "no-store", signal: controller.signal });

                if (!response.ok)
                {
                    return;
                }

                const data = await response.json() as BoardResponse;

                if (data.journeys && !controller.signal.aborted)
                {
                    setJourneys(data.journeys);
                    setUpdatedAt(data.updatedAt ?? latestUpdate(data.journeys));
                }
            }
            catch
            {
            }
            finally
            {
                if (!controller.signal.aborted)
                {
                    timer = setTimeout(() => void refresh(), 30_000);
                }
            }
        };
        void refresh();

        return () =>
        {
            controller.abort();
            clearTimeout(timer);
        };
    }, []);

    return (
        <section className="station-board" aria-labelledby="station-board-title">
            <header className="station-board-header">
                <div>
                    <span className="station-board-live"><i /> {localize(locale, "Panneau des bus en temps réel", "Live bus departures", "Panel de autobuses en tiempo real")}</span>
                    <h2 id="station-board-title">{localize(locale, "En circulation et prochains départs", "Live and upcoming buses", "Autobuses en circulación y próximas salidas")}</h2>
                </div>
                <time dateTime={updatedAt ?? undefined}>{formatUpdatedAt(updatedAt, locale)}</time>
            </header>
            <div className="station-board-columns" aria-hidden="true">
                <span>{localize(locale, "Passage", "Time", "Hora")}</span>
                <span>Bus</span>
                <span>{localize(locale, "Trajet", "Route", "Ruta")}</span>
                <span>{localize(locale, "État", "Status", "Estado")}</span>
                <span />
            </div>
            <div className="station-board-rows" aria-live="polite">
                {journeys.length === 0 ? (
                    <div className="station-board-empty">
                        <strong>{localize(locale, "En attente du prochain passage", "Waiting for the next service", "Esperando la próxima salida")}</strong>
                        <span>{localize(locale, "Les horaires seront actualisés automatiquement.", "Times will update automatically.", "Los horarios se actualizarán automáticamente.")}</span>
                    </div>
                ) : journeys.map((journey) =>
                {
                    const event = boardEvent(journey, locale);

                    return (
                        <Link
                            className="station-board-row"
                            href={journeyPath(journey)}
                            key={journey.journeyRef}
                        >
                            <time dateTime={event.time ?? undefined}>
                                <span>{formatTime(event.time, locale)}</span>
                                <small>{formatDay(event.time, updatedAt, locale)}</small>
                            </time>
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
                <span>{localize(locale, "Retards Alsa, BlaBlaCar Bus et FlixBus en temps réel", "Live Alsa, BlaBlaCar Bus and FlixBus delays", "Retrasos de Alsa, BlaBlaCar Bus y FlixBus en tiempo real")}</span>
                <span>{localize(locale, "Actualisation automatique · 30 s", "Automatic refresh · 30 sec", "Actualización automática · 30 s")}</span>
            </footer>
        </section>
    );
}

function boardEvent(journey: JourneyView, locale: Locale): { time: string | null; label: string }
{
    const event = liveBoardEvent(journey);
    return {
        time: event.time,
        label: `${eventTypeLabel(event.type, locale)} · ${event.stop?.name ?? journey.destinationName}`
    };
}

function eventTypeLabel(type: LiveBoardEventType, locale: Locale): string
{
    return {
        departure: localize(locale, "Départ", "Departure", "Salida"),
        next_stop: localize(locale, "Prochain arrêt", "Next stop", "Próxima parada"),
        arrival: localize(locale, "Arrivée", "Arrival", "Llegada")
    }[type];
}

function statusLabel(journey: JourneyView, locale: Locale): string
{
    if (journey.cancelled || journey.status === "cancelled")
    {
        return localize(locale, "Annulé", "Cancelled", "Cancelado");
    }

    if (journey.status === "arrived")
    {
        return localize(locale, "Arrivé", "Arrived", "Ha llegado");
    }

    if (journey.delaySeconds === null)
    {
        return journey.status === "in_transit"
            ? localize(locale, "En route", "En route", "En ruta")
            : localize(locale, "À venir", "Upcoming", "Próximo");
    }

    const minutes = Math.round(journey.delaySeconds / 60);

    if (Math.abs(minutes) < 5)
    {
        return journey.status === "in_transit"
            ? localize(locale, "En route", "En route", "En ruta")
            : localize(locale, "À l’heure", "On time", "Puntual");
    }

    return minutes > 0
        ? `+${minutes} min`
        : localize(locale, `${Math.abs(minutes)} min d’avance`, `${Math.abs(minutes)} min early`, `${Math.abs(minutes)} min de adelanto`);
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
        return localize(locale, "En attente des données", "Waiting for data", "Esperando datos");
    }

    return `${localize(locale, "Mis à jour", "Updated", "Actualizado")} ${new Intl.DateTimeFormat(localeTag(locale),
    {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "Europe/Paris"
    }).format(new Date(value))}`;
}

function formatDay(value: string | null, reference: string | null, locale: Locale): string
{
    if (!value)
    {
        return "";
    }

    const eventDay = localDayNumber(value);
    const referenceDay = localDayNumber(reference ?? new Date().toISOString());
    const difference = Math.round((eventDay - referenceDay) / 86_400_000);

    if (difference === -1)
    {
        return localize(locale, "Hier", "Yesterday", "Ayer");
    }

    if (difference === 0)
    {
        return localize(locale, "Aujourd’hui", "Today", "Hoy");
    }

    if (difference === 1)
    {
        return localize(locale, "Demain", "Tomorrow", "Mañana");
    }

    return new Intl.DateTimeFormat(localeTag(locale),
    {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Paris"
    }).format(new Date(value));
}

function localDayNumber(value: string): number
{
    const parts = new Intl.DateTimeFormat("en",
    {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        timeZone: "Europe/Paris"
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes): number =>
    {
        return Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
    };
    return Date.UTC(part("year"), part("month") - 1, part("day"));
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
