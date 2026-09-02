import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyCard } from "../../../components/journey-card";
import { SearchBox } from "../../../components/search-box";
import { StructuredData } from "../../../components/structured-data";
import { citySlug } from "../../../src/application/journey-view";
import { absoluteUrl, breadcrumbStructuredData } from "../../../src/application/seo";
import { groupStationJourneysByDate, stationDateHeading } from "../../../src/application/station-schedule";
import { transitDataService } from "../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ stopId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const { stopId } = await params;
    const board = await transitDataService.getStopBoard(stopId);

    if (!board)
    {
        return { title: "Gare introuvable" };
    }

    return {
        title: `Bus à ${board.city} : départs et retards en direct`,
        description: `Consultez les départs BlaBlaCar Bus à ${board.name}, les horaires réels et les retards en direct.`,
        alternates: { canonical: `/gares/${encodeURIComponent(board.stopId)}` },
        openGraph: {
            title: `Départs en direct à ${board.name}`,
            description: `Horaires et retards des bus à ${board.city}.`,
            type: "website",
            url: `/gares/${encodeURIComponent(board.stopId)}`
        },
        other: {
            "geo.position": `${board.latitude};${board.longitude}`,
            "geo.placename": board.city
        }
    };
}

export default async function StopPage({ params }: PageProps)
{
    const { stopId } = await params;
    const board = await transitDataService.getStopBoard(stopId);

    if (!board)
    {
        notFound();
    }

    const slug = citySlug(board.city);
    const destinations = new Map<string, { stopId: string; name: string; city: string }>();

    for (const journey of board.journeys)
    {
        const originIndex = journey.stops.findIndex((stop) => stop.stopId === board.stopId);

        for (const stop of journey.stops.slice(originIndex + 1))
        {
            destinations.set(stop.stopId,
            {
                stopId: stop.stopId,
                name: stop.name,
                city: stop.city
            });
        }
    }

    const destinationList = [...destinations.values()].slice(0, 12);
    const journeyGroups = groupStationJourneysByDate(board.journeys, board.stopId);

    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: "Accueil", path: "/" },
            { name: "Villes et gares", path: "/villes" },
            { name: board.city, path: `/ville/${slug}` },
            { name: board.name, path: `/gares/${encodeURIComponent(board.stopId)}` }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "BusStation",
            name: board.name,
            url: absoluteUrl(`/gares/${encodeURIComponent(board.stopId)}`),
            address: {
                "@type": "PostalAddress",
                addressLocality: board.city
            },
            geo: {
                "@type": "GeoCoordinates",
                latitude: board.latitude,
                longitude: board.longitude
            }
        }
    ];

    return (
        <div className="page-shell listing-page">
            <nav className="breadcrumbs" aria-label="Fil d’Ariane">
                <Link href="/">Accueil</Link><span>›</span><Link href="/villes">Villes</Link><span>›</span><Link href={`/ville/${slug}`}>{board.city}</Link><span>›</span><span>{board.name}</span>
            </nav>
            <header className="listing-heading">
                <span className="section-kicker">Départs en temps réel</span>
                <h1>Bus à <em>{board.city}</em></h1>
                <p>{board.name}</p>
                <SearchBox compact initialQuery="" />
            </header>
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> Temps réel</span><h2>Prochains bus à cette gare</h2></div>
                    <span>{board.journeys.length} passage{board.journeys.length > 1 ? "s" : ""} à venir</span>
                </div>
                <div className="station-delay-legend" aria-label="Légende de l’état des bus">
                    <span className="late"><i /> Retard</span>
                    <span className="on-time"><i /> À l’heure</span>
                    <span className="early"><i /> En avance</span>
                    <span className="scheduled"><i /> Horaire prévu</span>
                </div>
                {board.journeys.length === 0 ? (
                    <div className="empty-state"><h2>Aucun passage à venir</h2><p>Les prochains horaires ne sont pas encore disponibles.</p></div>
                ) : (
                    <div className="station-journey-groups">
                        {journeyGroups.map((group) =>
                        {
                            const heading = stationDateHeading(group.date);

                            return (
                                <section className="station-journey-group" key={group.date}>
                                    <div className="station-date-heading">
                                        <h3>
                                            {heading.relative && <span>{heading.relative}</span>}
                                            <time dateTime={group.date}>{heading.full}</time>
                                        </h3>
                                        <span>{group.journeys.length} passage{group.journeys.length > 1 ? "s" : ""}</span>
                                    </div>
                                    <div className="journey-list">
                                        {group.journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} stopId={board.stopId} />)}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </section>
            {destinationList.length > 0 && (
                <section className="route-suggestions-section">
                    <div className="section-heading-row">
                        <h2>Liaisons depuis cette gare</h2>
                        <span>{destinationList.length} destination{destinationList.length > 1 ? "s" : ""}</span>
                    </div>
                    <div className="route-suggestion-grid">
                        {destinationList.map((destination) =>
                        {
                            return (
                                <Link href={`/trajets/${encodeURIComponent(board.stopId)}/${encodeURIComponent(destination.stopId)}`} key={destination.stopId}>
                                    <span>{board.city}</span><b>→</b><strong>{destination.city}</strong><small>{destination.name}</small>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}
            <StructuredData value={structuredData} />
        </div>
    );
}
