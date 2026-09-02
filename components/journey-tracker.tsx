"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { JourneyStopView, JourneyView } from "../src/application/journey-view";
import type { PassengerReport, PassengerReportType } from "../src/application/passenger-reports";

interface JourneyResponse
{
    journey: JourneyView;
}

interface ReportsResponse
{
    reports: PassengerReport[];
}

const reportChoices: Array<{ type: PassengerReportType; icon: string; label: string }> = [
    { type: "BUS_NOT_HERE", icon: "◷", label: "Bus absent" },
    { type: "BUS_ARRIVED", icon: "●", label: "Bus arrivé" },
    { type: "BOARDING", icon: "↳", label: "Embarquement" },
    { type: "BUS_DEPARTED", icon: "→", label: "Bus parti" },
    { type: "PLATFORM_CHANGED", icon: "⇄", label: "Quai modifié" },
    { type: "DRIVER_DELAY", icon: "+", label: "Retard annoncé" }
];

export function JourneyTracker({ initialJourney }: { initialJourney: JourneyView })
{
    const [journey, setJourney] = useState(initialJourney);
    const [reports, setReports] = useState<PassengerReport[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [reporting, setReporting] = useState<PassengerReportType | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const currentStop = useMemo(() =>
    {
        return journey.stops.find((stop) => stop.phase === "current") ?? journey.stops[journey.stops.length - 1];
    }, [journey]);

    useEffect(() =>
    {
        void refreshReports();
        const interval = journey.realtimeAvailable
            ? window.setInterval(() => void refreshJourney(), 30_000)
            : null;
        return () =>
        {
            if (interval !== null)
            {
                window.clearInterval(interval);
            }
        };
    }, []);

    async function refreshJourney(): Promise<void>
    {
        setRefreshing(true);

        try
        {
            const response = await fetch(`/api/journeys/${encodeURIComponent(journey.journeyRef)}`, { cache: "no-store" });

            if (response.ok)
            {
                const data = await response.json() as JourneyResponse;
                setJourney(data.journey);
            }
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
                setFeedback(data.error ?? "Signalement impossible pour le moment.");
                return;
            }

            setFeedback("Merci, votre information est maintenant visible.");
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
                <div className="tracker-summary">
                    <div>
                        <span className={`operational-pill ${journey.status}`}><i /> {journey.realtimeAvailable ? statusLabel(journey.status) : "Horaire prévu"}</span>
                        <p>{journey.realtimeAvailable
                            ? `Dernière donnée officielle ${relativeTime(journey.updatedAt)} ${refreshing ? "· actualisation…" : ""}`
                            : `Horaire théorique officiel ${journey.operatorName}`}</p>
                    </div>
                    <div className={`big-delay ${delayTone(journey.delaySeconds)}`}>
                        <strong>{delayNumber(journey.delaySeconds)}</strong>
                        <span>{delayCaption(journey.delaySeconds)}</span>
                    </div>
                </div>
                <ol className="route-timeline">
                    {journey.stops.map((stop) =>
                    {
                        return <StopRow key={`${stop.stopId}-${stop.order}`} stop={stop} />;
                    })}
                </ol>
                <div className="tracker-source">
                    <span>{journey.realtimeAvailable ? "Données officielles SIRI-Lite" : "Horaires officiels GTFS"}</span>
                    <span>{journey.realtimeAvailable
                        ? `Correspondance GTFS ${journey.matchConfidence === null ? "non vérifiée" : `${Math.round(journey.matchConfidence * 100)} %`}`
                        : "Aucun suivi en temps réel public"}</span>
                </div>
            </section>
            <aside className="community-panel">
                <span className="section-kicker">Informations voyageurs</span>
                <h2>Que voyez-vous&nbsp;?</h2>
                <p>Un clic suffit. Aucun compte n’est nécessaire.</p>
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
                                {reporting === choice.type ? "Envoi…" : choice.label}
                            </button>
                        );
                    })}
                </div>
                {feedback && <p className="report-feedback" role="status">{feedback}</p>}
                <div className="punctuality-card">
                    <span className="section-kicker">Historique de la ligne</span>
                    {!journey.realtimeAvailable ? (
                        <p>FlixBus ne publie pas de flux temps réel ouvert pour calculer la ponctualité.</p>
                    ) : journey.punctuality ? (
                        <>
                            <div><strong>{journey.punctuality.onTimePercentage}&nbsp;%</strong><span>à moins de {journey.punctuality.thresholdMinutes} min</span></div>
                            <p>Retard moyen {averageDelay(journey.punctuality.averageDelaySeconds)} sur {journey.punctuality.sampleSize} arrivée{journey.punctuality.sampleSize > 1 ? "s" : ""} observée{journey.punctuality.sampleSize > 1 ? "s" : ""}.</p>
                        </>
                    ) : (
                        <p>L’historique se construit à chaque passage enregistré.</p>
                    )}
                </div>
                <div className="recent-reports">
                    <h3>Derniers signalements</h3>
                    {reports.length === 0 ? (
                        <p className="empty-reports">Aucun signalement pour l’instant. Soyez le premier.</p>
                    ) : reports.slice(0, 5).map((report) =>
                    {
                        return (
                            <div key={report.id}>
                                <span>{reportLabel(report.type)}</span>
                                <time dateTime={report.createdAt}>{relativeTime(report.createdAt)}</time>
                            </div>
                        );
                    })}
                </div>
            </aside>
        </div>
    );
}

function StopRow({ stop }: { stop: JourneyStopView })
{
    const primary = stop.actualArrivalAt
        ?? stop.actualDepartureAt
        ?? stop.expectedArrivalAt
        ?? stop.expectedDepartureAt
        ?? stop.aimedArrivalAt
        ?? stop.aimedDepartureAt;
    const aimed = stop.aimedArrivalAt ?? stop.aimedDepartureAt;

    return (
        <li className={stop.phase}>
            <span className="timeline-marker" />
            <div className="stop-copy">
                <Link href={`/gares/${encodeURIComponent(stop.stopId)}`}>{stop.city}</Link>
                <span>{stop.name}</span>
            </div>
            <div className="stop-time">
                <strong>{formatTime(primary)}</strong>
                {primary !== aimed && aimed && <del>{formatTime(aimed)}</del>}
            </div>
            <span className={`stop-delay ${delayTone(stop.delaySeconds)}`}>{shortDelay(stop.delaySeconds)}</span>
        </li>
    );
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
        timeZone: "Europe/Paris"
    }).format(new Date(value));
}

function relativeTime(value: string): string
{
    const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

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

function statusLabel(status: JourneyView["status"]): string
{
    return {
        scheduled: "Départ à venir",
        in_transit: "En route",
        arrived: "Trajet terminé",
        cancelled: "Trajet annulé"
    }[status];
}

function delayNumber(seconds: number | null): string
{
    if (seconds === null)
    {
        return "—";
    }

    const minutes = Math.round(seconds / 60);
    return minutes > 0 ? `+${minutes}` : String(minutes);
}

function delayCaption(seconds: number | null): string
{
    if (seconds === null)
    {
        return "pas d’information en temps réel";
    }

    if (Math.abs(seconds) < 300)
    {
        return "à l'heure";
    }

    return seconds > 0 ? "minutes de retard" : "minutes d'avance";
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

function reportLabel(type: PassengerReportType): string
{
    return reportChoices.find((choice) => choice.type === type)?.label ?? type;
}

function averageDelay(seconds: number): string
{
    const minutes = Math.round(seconds / 60);

    if (minutes === 0)
    {
        return "nul";
    }

    return minutes > 0 ? `+${minutes} min` : `${Math.abs(minutes)} min d’avance`;
}
