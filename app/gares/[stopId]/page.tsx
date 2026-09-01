import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyCard } from "../../../components/journey-card";
import { SearchBox } from "../../../components/search-box";
import { StructuredData } from "../../../components/structured-data";
import { citySlug } from "../../../src/application/journey-view";
import { absoluteUrl, breadcrumbStructuredData } from "../../../src/application/seo";
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
                    <div><span className="live-pill light"><i /> Direct</span><h2>Prochains passages à cette gare</h2></div>
                    <span>{board.journeys.length} bus trouvé{board.journeys.length > 1 ? "s" : ""}</span>
                </div>
                {board.journeys.length === 0 ? (
                    <div className="empty-state"><h2>Aucun bus dans le flux actuel</h2><p>Revenez à l’approche des prochains départs.</p></div>
                ) : (
                    <div className="journey-list">{board.journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} stopId={board.stopId} />)}</div>
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
