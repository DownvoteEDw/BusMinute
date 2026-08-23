import Link from "next/link";
import type { JourneyView } from "../src/application/journey-view";

export function JourneyCard({ journey }: { journey: JourneyView })
{
    return (
        <Link className="journey-card" href={`/suivi/${encodeURIComponent(journey.journeyRef)}`}>
            <div className="journey-card-head">
                <span>Bus {journey.serviceNumber}</span>
                <span className={`status-dot ${journey.status}`} />
            </div>
            <h2>{journey.originCity} <span>→</span> {journey.destinationCity}</h2>
            <div className="journey-card-meta">
                <span>{statusLabel(journey.status)}</span>
                <strong className={delayTone(journey.delaySeconds)}>{delayLabel(journey.delaySeconds)}</strong>
            </div>
        </Link>
    );
}

function statusLabel(status: JourneyView["status"]): string
{
    const labels = {
        scheduled: "Départ programmé",
        in_transit: "En circulation",
        arrived: "Trajet terminé",
        cancelled: "Trajet annulé"
    };
    return labels[status];
}

function delayLabel(seconds: number | null): string
{
    if (seconds === null)
    {
        return "Horaire prévu";
    }

    const minutes = Math.round(seconds / 60);

    if (Math.abs(minutes) < 5)
    {
        return "À l'heure";
    }

    return minutes > 0 ? `+${minutes} min` : `${Math.abs(minutes)} min d'avance`;
}

function delayTone(seconds: number | null): string
{
    if (seconds === null || Math.abs(seconds) < 300)
    {
        return "on-time";
    }

    return seconds > 0 ? "late" : "early";
}
