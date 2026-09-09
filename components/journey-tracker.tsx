"use client";

import Link from "next/link";
import { journeyPathSegment } from "../src/application/journey-url";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { localeTag, localize, type Locale } from "../src/application/i18n";
import type { JourneyStopView, JourneyView } from "../src/application/journey-view";
import type { PassengerReport, PassengerReportType } from "../src/application/passenger-reports";
import { isJourneyCompleted } from "../src/application/seo";
import { journeyVehicleProgress, retainLastVehiclePositions, type JourneyVehicleProgress } from "../src/application/journey-map";
import { JourneyMap } from "./journey-map";

interface JourneyResponse
{
    journey: JourneyView;
}

interface ReportsResponse
{
    reports: PassengerReport[];
}

const reportChoices: Array<{ type: PassengerReportType; icon: string }> = [
    { type: "BUS_NOT_HERE", icon: "◷" },
    { type: "BUS_ARRIVED", icon: "●" },
    { type: "BOARDING", icon: "↳" },
    { type: "BUS_DEPARTED", icon: "→" },
    { type: "PLATFORM_CHANGED", icon: "⇄" },
    { type: "DRIVER_DELAY", icon: "+" }
];

interface JourneyTrackerProps
{
    initialJourney: JourneyView;
    completed?: boolean;
    locale?: Locale;
    mapStyleUrl?: string;
    initialNow: number;
}

export function JourneyTracker({ initialJourney, locale = "fr", completed = false, mapStyleUrl, initialNow }: JourneyTrackerProps)
{
    const [journey, setJourney] = useState(initialJourney);
    const [now, setNow] = useState(initialNow);
    const isCompleted = completed || isJourneyCompleted(journey, new Date(now));
    const [reports, setReports] = useState<PassengerReport[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshFailed, setRefreshFailed] = useState(false);
    const [reporting, setReporting] = useState<PassengerReportType | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const isOnTime = journey.delaySeconds !== null && Math.abs(journey.delaySeconds) < 300;
    const staleRealtime = journey.realtimeObserved && isRealtimeStale(journey.updatedAt, now);
    const currentStop = useMemo(() =>
    {
        return journey.stops.find((stop) => stop.phase === "current") ?? journey.stops[journey.stops.length - 1];
    }, [journey]);
    const vehicleProgress = journeyVehicleProgress(journey, now, isCompleted);

    useEffect(() =>
    {
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() =>
    {
        void refreshReports();
    }, []);

    useEffect(() =>
    {
        const interval = !isCompleted && journey.realtimeAvailable
            && journey.realtimeStatus !== "not_offered"
            && journey.realtimeStatus !== "outside_tracking_period"
            ? window.setInterval(() => void refreshJourney(), 30_000)
            : null;
        return () =>
        {
            if (interval !== null)
            {
                window.clearInterval(interval);
            }
        };
    }, [isCompleted, journey.realtimeAvailable, journey.realtimeStatus]);

    async function refreshJourney(): Promise<void>
    {
        setRefreshing(true);

        try
        {
            const response = await fetch(`/api/journeys/${journeyPathSegment(journey.journeyRef)}`, { cache: "no-store" });

            if (response.ok)
            {
                const data = await response.json() as JourneyResponse;
                setJourney((previous) => retainLastVehiclePositions(previous, data.journey));
                setRefreshFailed(false);
            }
            else
            {
                setRefreshFailed(true);
            }
        }
        catch
        {
            setRefreshFailed(true);
        }
        finally
        {
            setRefreshing(false);
        }
    }

    async function refreshReports(): Promise<void>
    {
        const response = await fetch(`/api/reports?journeyRef=${encodeURIComponent(journey.journeyRef)}`, { cache: "no-store" });

        if (response.ok)
        {
            const data = await response.json() as ReportsResponse;
            setReports(data.reports);
        }
    }

    async function sendReport(type: PassengerReportType): Promise<void>
    {
        setReporting(type);
        setFeedback(null);

        try
        {
            const response = await fetch("/api/reports",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    journeyRef: journey.journeyRef,
                    stopId: currentStop?.stopId ?? null,
                    type
                })
            });
            const data = await response.json() as { error?: string };

            if (!response.ok)
            {
                setFeedback(localize(
                    locale,
                    data.error ?? "Signalement impossible pour le moment.",
                    "Unable to submit your report right now.",
                    "No se ha podido enviar tu aviso."
                ));
                return;
            }

            setFeedback(localize(locale, "Merci, votre information est maintenant visible.", "Thank you. Your update is now visible.", "Gracias. Tu aviso ya está visible."));
            await refreshReports();
        }
        finally
        {
            setReporting(null);
        }
    }

    return (
        <div className="tracker-grid">
            <section className="tracker-main">
                <div className={`tracker-summary${staleRealtime ? " is-stale" : ""}`}>
                    <div>
                        <span className={`operational-pill ${staleRealtime ? "stale" : journey.realtimeObserved ? journey.status : "scheduled"}`}><i /> {isCompleted ? localize(locale, "Trajet terminé", "Journey completed", "Trayecto finalizado") : realtimeHeadline(journey, staleRealtime, locale)}</span>
                        <p>{isCompleted ? localize(locale, "Horaires enregistrés pour cette circulation passée.", "Recorded times for this past journey.", "Horarios registrados de este trayecto pasado.") : realtimeDescription(journey, refreshing, locale, now)}</p>
                    </div>
                    <div className={`big-delay ${delayTone(journey.delaySeconds)}${isOnTime ? " is-on-time-label" : ""}${staleRealtime ? " is-stale" : ""}`}>
                        <strong>{delayNumber(journey.delaySeconds, locale)}</strong>
                        <span>{staleRealtime ? localize(locale, `dernière estimation · ${delayCaption(journey, locale)}`, `last estimate · ${delayCaption(journey, locale)}`, `última estimación · ${delayCaption(journey, locale)}`) : delayCaption(journey, locale)}</span>
                    </div>
                </div>
                <JourneyMap journey={journey} locale={locale} completed={isCompleted} refreshFailed={refreshFailed} styleUrl={mapStyleUrl} />
                <ol className="route-timeline">
                    {journey.stops.map((stop, index) =>
                    {
                        return <StopRow
                            key={`${stop.stopId}-${stop.order}`}
                            locale={locale}
                            stop={stop}
                            journeyDelaySeconds={journey.realtimeObserved ? journey.delaySeconds : null}
                            vehicleProgress={vehicleProgress?.afterStopIndex === index ? vehicleProgress : null}
                            nextStopName={journey.stops[index + 1]?.city ?? null}
                        />;
                    })}
                </ol>
            </section>
            <aside className="community-panel">
                <span className="section-kicker">{localize(locale, "Informations voyageurs", "Passenger updates", "Avisos de viajeros")}</span>
                {!isCompleted && <>
                <h2>{localize(locale, "Que voyez-vous ?", "What can you see?", "¿Qué estás viendo?")}</h2>
                <p>{localize(locale, "Un clic suffit. Aucun compte n’est nécessaire.", "One tap is enough. No account needed.", "Basta con un toque. No necesitas una cuenta.")}</p>
                <div className="report-grid">
                    {reportChoices.map((choice) =>
                    {
                        return (
                            <button
                                disabled={reporting !== null}
                                key={choice.type}
                                onClick={() => void sendReport(choice.type)}
                            >
                                <span>{choice.icon}</span>
                                {reporting === choice.type ? localize(locale, "Envoi…", "Sending…", "Enviando…") : reportLabel(choice.type, locale)}
                            </button>
                        );
                    })}
                </div>
                {feedback && <p className="report-feedback" role="status">{feedback}</p>}
                </>}
                <div className={`punctuality-card${journey.punctuality ? ` ${punctualityTone(journey.punctuality.onTimePercentage)}` : ""}`}>
                    <span className="section-kicker">{localize(locale, "Ponctualité à l’arrivée", "Arrival punctuality", "Puntualidad en la llegada")}</span>
                    {journey.punctuality ? (
                        <>
                            <div className="punctuality-summary">
                                <strong>{journey.punctuality.onTimePercentage}&nbsp;%</strong>
                                <span>{localize(
                                    locale,
                                    `des arrivées avec ${journey.punctuality.thresholdMinutes} min d’écart maximum`,
                                    `of arrivals within ${journey.punctuality.thresholdMinutes} minutes of schedule`,
                                    `de las llegadas con una diferencia máxima de ${journey.punctuality.thresholdMinutes} min respecto al horario`
                                )}</span>
                            </div>
                            <div className="punctuality-details">
                                <div>
                                    <span>{localize(locale, "Retard moyen à l’arrivée", "Average arrival delay", "Retraso medio en la llegada")}</span>
                                    <strong>{averageDelay(journey.punctuality.averageDelaySeconds, locale)}</strong>
                                </div>
                                <div>
                                    <span>{localize(locale, "Calcul basé sur", "Based on", "Cálculo basado en")}</span>
                                    <strong>{localize(
                                        locale,
                                        `${journey.punctuality.sampleSize} arrivée${journey.punctuality.sampleSize > 1 ? "s" : ""} sur ${journey.punctuality.windowDays} jours`,
                                        `${journey.punctuality.sampleSize} arrival${journey.punctuality.sampleSize === 1 ? "" : "s"} over ${journey.punctuality.windowDays} days`,
                                        `${journey.punctuality.sampleSize} llegada${journey.punctuality.sampleSize === 1 ? "" : "s"} en ${journey.punctuality.windowDays} días`
                                    )}</strong>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="punctuality-empty">{localize(locale, "Pas encore assez d’arrivées enregistrées pour calculer la ponctualité.", "Not enough recorded arrivals yet to calculate punctuality.", "Todavía no hay suficientes llegadas registradas para calcular la puntualidad.")}</p>
                    )}
                </div>
                <div className="recent-reports">
                    <h3>{localize(locale, "Derniers signalements", "Latest reports", "Últimos avisos")}</h3>
                    {reports.length === 0 ? (
                        <p className="empty-reports">{isCompleted ? localize(locale, "Aucun signalement enregistré.", "No reports recorded.", "No hay avisos registrados.") : localize(locale, "Aucun signalement pour l’instant. Soyez le premier.", "No reports yet. Be the first.", "Todavía no hay avisos. Sé el primero en informar.")}</p>
                    ) : reports.slice(0, 5).map((report) =>
                    {
                        return (
                            <div key={report.id}>
                                <span>{reportLabel(report.type, locale)}</span>
                                <time dateTime={report.createdAt}>{relativeTime(report.createdAt, locale, now)}</time>
                            </div>
                        );
                    })}
                </div>
            </aside>
        </div>
    );
}

function StopRow({ stop, locale, journeyDelaySeconds, vehicleProgress, nextStopName }: {
    stop: JourneyStopView;
    locale: Locale;
    journeyDelaySeconds: number | null;
    vehicleProgress: JourneyVehicleProgress | null;
    nextStopName: string | null;
})
{
    const aimed = stop.aimedArrivalAt ?? stop.aimedDepartureAt;
    const expected = stop.expectedArrivalAt ?? stop.expectedDepartureAt;
    const actual = stop.actualArrivalAt ?? stop.actualDepartureAt;
    const displayedDelay = stop.delaySeconds ?? (stop.phase === "passed" ? null : journeyDelaySeconds);
    const projected = shiftedTime(aimed, displayedDelay);
    const primary = actual
        ?? (stop.delaySeconds === null ? projected ?? expected : expected ?? projected)
        ?? aimed;

    return (
        <li className={stop.phase}>
            <span className="timeline-marker" />
            {vehicleProgress && nextStopName && <span
                className={`timeline-bus${vehicleProgress.approximate ? " is-approximate" : ""}`}
                role="img"
                aria-label={vehicleProgress.approximate
                    ? localize(locale, `Position approximative du bus entre ${stop.city} et ${nextStopName}`, `Approximate bus location between ${stop.city} and ${nextStopName}`, `Ubicación aproximada del autobús entre ${stop.city} y ${nextStopName}`)
                    : localize(locale, `Position du bus entre ${stop.city} et ${nextStopName}`, `Bus location between ${stop.city} and ${nextStopName}`, `Ubicación del autobús entre ${stop.city} y ${nextStopName}`)}
                style={{ "--timeline-bus-offset": `${44 + 88 * vehicleProgress.progress}px` } as CSSProperties}
            ><img src="/icons/bus-map.svg" alt="" /></span>}
            <div className="stop-copy">
                <Link href={`/gares/${encodeURIComponent(stop.stopId)}`}>{stop.city}</Link>
                <span>{stop.name}</span>
            </div>
            <div className="stop-time">
                <strong>{formatTime(primary, locale)}</strong>
                {primary !== aimed && aimed && <del>{formatTime(aimed, locale)}</del>}
            </div>
            <span className={`stop-delay ${delayTone(displayedDelay)}`}>{shortDelay(displayedDelay)}</span>
        </li>
    );
}

function shiftedTime(value: string | null, delaySeconds: number | null): string | null
{
    if (!value || delaySeconds === null)
    {
        return null;
    }

    return new Date(new Date(value).getTime() + delaySeconds * 1000).toISOString();
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
        timeZone: "Europe/Paris"
    }).format(new Date(value));
}

function relativeTime(value: string, locale: Locale, now: number): string
{
    const seconds = Math.round((new Date(value).getTime() - now) / 1000);
    const formatter = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: "auto" });

    if (Math.abs(seconds) < 60)
    {
        return formatter.format(seconds, "second");
    }

    const minutes = Math.round(seconds / 60);

    if (Math.abs(minutes) < 60)
    {
        return formatter.format(minutes, "minute");
    }

    return formatter.format(Math.round(minutes / 60), "hour");
}

function isRealtimeStale(value: string, now: number): boolean
{
    const timestamp = new Date(value).getTime();

    return Number.isFinite(timestamp) && now - timestamp > 15 * 60 * 1000;
}

function statusLabel(status: JourneyView["status"], locale: Locale): string
{
    return {
        scheduled: localize(locale, "Départ à venir", "Upcoming departure", "Próxima salida"),
        in_transit: localize(locale, "En route", "En route", "En ruta"),
        arrived: localize(locale, "Trajet terminé", "Journey completed", "Trayecto finalizado"),
        cancelled: localize(locale, "Trajet annulé", "Journey cancelled", "Trayecto cancelado")
    }[status];
}

function delayNumber(seconds: number | null, locale: Locale): string
{
    if (seconds === null)
    {
        return "—";
    }

    if (Math.abs(seconds) < 300)
    {
        return localize(locale, "À l’heure", "On time", "Puntual");
    }

    const minutes = Math.round(seconds / 60);
    return minutes > 0 ? `+${minutes}` : String(Math.abs(minutes));
}

function realtimeHeadline(journey: JourneyView, stale: boolean, locale: Locale): string
{
    if (stale)
    {
        return localize(locale, "Information temps réel ancienne", "Stale live information", "Datos en tiempo real desactualizados");
    }

    if (journey.realtimeObserved)
    {
        return statusLabel(journey.status, locale);
    }

    return journey.realtimeStatus === "temporarily_unavailable"
        ? localize(locale, "Suivi momentanément indisponible", "Live tracking temporarily unavailable", "Seguimiento temporalmente no disponible")
        : localize(locale, "Horaire prévu", "Scheduled", "Horario previsto");
}

function realtimeDescription(
    journey: JourneyView,
    refreshing: boolean,
    locale: Locale,
    now: number
): string
{
    if (journey.realtimeObserved)
    {
        return `${localize(locale, `Dernière donnée ${journey.operatorName} reçue`, `Latest ${journey.operatorName} data received`, `Último dato de ${journey.operatorName} recibido`)} ${relativeTime(journey.updatedAt, locale, now)} ${refreshing ? localize(locale, "· vérification…", "· checking…", "· comprobando…") : ""}`;
    }

    if (journey.realtimeStatus === "not_offered")
    {
        return localize(
            locale,
            `${journey.operatorName} ne propose pas de suivi en direct pour ce véhicule.`,
            `${journey.operatorName} does not offer live tracking for this vehicle.`,
            `${journey.operatorName} no ofrece seguimiento en directo para este vehículo.`
        );
    }

    if (journey.realtimeStatus === "temporarily_unavailable")
    {
        return localize(
            locale,
            "Le suivi en direct n’est pas disponible pour le moment. Les horaires prévus restent affichés.",
            "Live tracking is not available right now. Scheduled times remain visible.",
            "El seguimiento en directo no está disponible por el momento. Se siguen mostrando los horarios previstos."
        );
    }

    if (journey.realtimeStatus === "outside_tracking_period")
    {
        const departureAt = journey.stops[0]?.aimedDepartureAt;
        const departureIsAhead = departureAt && new Date(departureAt).getTime() > now;
        return departureIsAhead
            ? localize(
                locale,
                "Le suivi en direct pourra apparaître à l’approche du départ.",
                "Live tracking may appear closer to departure.",
                "El seguimiento en directo podrá aparecer cuando se acerque la salida."
            )
            : localize(
                locale,
                "Les horaires prévus de ce trajet sont affichés.",
                "The scheduled times for this journey are displayed.",
                "Se muestran los horarios previstos de este trayecto."
            );
    }

    return `${localize(locale, "Horaire prévu", "Scheduled by", "Horario previsto de")} ${journey.operatorName}`;
}

function delayCaption(journey: JourneyView, locale: Locale): string
{
    const seconds = journey.delaySeconds;

    if (seconds === null)
    {
        if (journey.realtimeStatus === "not_offered")
        {
            return localize(locale, "suivi non proposé", "live tracking not offered", "seguimiento no disponible");
        }

        if (journey.realtimeStatus === "temporarily_unavailable")
        {
            return localize(locale, "suivi momentanément indisponible", "live tracking temporarily unavailable", "seguimiento temporalmente no disponible");
        }

        return localize(locale, "pas d’information en temps réel", "no live information", "sin información en tiempo real");
    }

    if (Math.abs(seconds) < 300)
    {
        return localize(locale, "moins de 5 min d’écart", "less than 5 min difference", "menos de 5 min de diferencia");
    }

    return seconds > 0
        ? localize(locale, "minutes de retard", "minutes late", "minutos de retraso")
        : localize(locale, "minutes d'avance", "minutes early", "minutos de adelanto");
}

function shortDelay(seconds: number | null): string
{
    if (seconds === null || Math.abs(seconds) < 60)
    {
        return "";
    }

    const minutes = Math.round(seconds / 60);
    return minutes > 0 ? `+${minutes} min` : `${minutes} min`;
}

function delayTone(seconds: number | null): string
{
    if (seconds === null || Math.abs(seconds) < 300)
    {
        return "on-time";
    }

    return seconds > 0 ? "late" : "early";
}

function reportLabel(type: PassengerReportType, locale: Locale): string
{
    const labels: Record<PassengerReportType, [string, string, string]> =
    {
        BUS_NOT_HERE: ["Bus absent", "Bus not here", "El autobús no está aquí"],
        BUS_ARRIVED: ["Bus arrivé", "Bus arrived", "El autobús ha llegado"],
        BOARDING: ["Embarquement", "Boarding", "Embarque"],
        BUS_DEPARTED: ["Bus parti", "Bus departed", "El autobús ha salido"],
        PLATFORM_CHANGED: ["Quai modifié", "Platform changed", "Cambio de andén"],
        DRIVER_DELAY: ["Retard annoncé", "Delay announced", "Retraso anunciado"]
    };
    const label = labels[type];
    return localize(locale, label[0], label[1], label[2]);
}

function averageDelay(seconds: number, locale: Locale): string
{
    const minutes = Math.round(seconds / 60);

    if (minutes === 0)
    {
        return localize(locale, "moins d’1 min", "less than 1 min", "menos de 1 min");
    }

    return minutes > 0
        ? localize(locale, `${minutes} min de retard`, `${minutes} min late`, `${minutes} min de retraso`)
        : localize(locale, `${Math.abs(minutes)} min d’avance`, `${Math.abs(minutes)} min early`, `${Math.abs(minutes)} min de adelanto`);
}

function punctualityTone(percentage: number): string
{
    if (percentage >= 80)
    {
        return "is-reliable";
    }

    if (percentage >= 50)
    {
        return "is-mixed";
    }

    return "is-unreliable";
}
