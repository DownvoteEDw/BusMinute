import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyTracker } from "../../../components/journey-tracker";
import { StructuredData } from "../../../components/structured-data";
import { citySlug } from "../../../src/application/journey-view";
import { absoluteUrl, breadcrumbStructuredData } from "../../../src/application/seo";
import { transitDataService } from "../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ journeyRef: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const { journeyRef: rawJourneyRef } = await params;
    const journeyRef = decodeURIComponent(rawJourneyRef);
    const journey = await transitDataService.getJourney(journeyRef);

    if (!journey)
    {
        return { title: "Bus introuvable" };
    }

    const title = `${journey.operatorName} ${journey.serviceNumber} ${journey.originCity} → ${journey.destinationCity}`;
    const description = journey.realtimeAvailable
        ? `Suivez le bus ${journey.serviceNumber} en direct : horaires réels, retard à chaque arrêt et signalements voyageurs.`
        : `Consultez les horaires théoriques officiels du FlixBus ${journey.serviceNumber}, de ${journey.originCity} à ${journey.destinationCity}.`;

    return {
        title,
        description,
        alternates: {
            canonical: `/suivi/${encodeURIComponent(journey.journeyRef)}`
        },
        openGraph: {
            title,
            description,
            type: "website",
            images: []
        },
        twitter: {
            card: "summary",
            title,
            description,
            images: []
        }
    };
}

export default async function JourneyPage({ params }: PageProps)
{
    const { journeyRef: rawJourneyRef } = await params;
    const journeyRef = decodeURIComponent(rawJourneyRef);
    const journey = await transitDataService.getJourney(journeyRef);

    if (!journey)
    {
        notFound();
    }

    const originCitySlug = citySlug(journey.originCity);
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: "Accueil", path: "/" },
            { name: "Villes et gares", path: "/villes" },
            { name: journey.originCity, path: `/ville/${originCitySlug}` },
            { name: `Bus ${journey.serviceNumber}`, path: `/suivi/${encodeURIComponent(journey.journeyRef)}` }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "BusTrip",
            name: `Bus ${journey.serviceNumber} ${journey.originCity} vers ${journey.destinationCity}`,
            url: absoluteUrl(`/suivi/${encodeURIComponent(journey.journeyRef)}`),
            busNumber: journey.serviceNumber,
            departureBusStop: {
                "@type": "BusStation",
                name: journey.originName,
                url: absoluteUrl(`/gares/${encodeURIComponent(journey.originStopId)}`)
            },
            arrivalBusStop: {
                "@type": "BusStation",
                name: journey.destinationName,
                url: absoluteUrl(`/gares/${encodeURIComponent(journey.destinationStopId)}`)
            },
            departureTime: journey.stops[0]?.aimedDepartureAt,
            arrivalTime: journey.stops[journey.stops.length - 1]?.aimedArrivalAt
        }
    ];

    return (
        <div className="page-shell tracker-page">
            <nav className="breadcrumbs" aria-label="Fil d’Ariane">
                <Link href="/">Accueil</Link><span>›</span><Link href="/villes">Villes</Link><span>›</span><Link href={`/ville/${originCitySlug}`}>{journey.originCity}</Link><span>›</span><span>Bus {journey.serviceNumber}</span>
            </nav>
            <header className="route-heading">
                <div>
                    <span className="section-kicker">{journey.realtimeAvailable ? "Suivi officiel + voyageurs" : "Horaire théorique officiel"}</span>
                    <h1>{journey.originCity} <span>→</span> {journey.destinationCity}</h1>
                    <p>{journey.operatorName} · Bus <strong>{journey.serviceNumber}</strong> · {longDate(journey.serviceDate)}</p>
                </div>
                <div className="route-links">
                    <Link href={`/gares/${encodeURIComponent(journey.originStopId)}`}>{journey.originCity}</Link>
                    <Link href={`/trajets/${encodeURIComponent(journey.originStopId)}/${encodeURIComponent(journey.destinationStopId)}`}>Voir cette liaison</Link>
                </div>
            </header>
            <JourneyTracker initialJourney={journey} />
            <StructuredData value={structuredData} />
        </div>
    );
}

function longDate(value: string): string
{
    return new Intl.DateTimeFormat("fr-FR",
    {
        dateStyle: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}
