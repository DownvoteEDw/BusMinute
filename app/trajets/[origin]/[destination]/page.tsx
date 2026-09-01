import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyCard } from "../../../../components/journey-card";
import { StructuredData } from "../../../../components/structured-data";
import { cityName, citySlug } from "../../../../src/application/journey-view";
import { absoluteUrl, breadcrumbStructuredData } from "../../../../src/application/seo";
import { transitDataService } from "../../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ origin: string; destination: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const { origin, destination } = await params;
    const board = await transitDataService.getRouteBoard(origin, destination);

    if (!board)
    {
        return { title: "Trajet introuvable" };
    }

    const originCity = cityName(board.originName);
    const destinationCity = cityName(board.destinationName);

    return {
        title: `Bus ${originCity} → ${destinationCity} : horaires et retards`,
        description: `Suivez les bus ${originCity} vers ${destinationCity}, leurs horaires réels et les retards signalés.`,
        alternates: { canonical: `/trajets/${board.originStopId}/${board.destinationStopId}` },
        robots: {
            index: board.journeys.length > 0,
            follow: true
        }
    };
}

export default async function RoutePage({ params }: PageProps)
{
    const { origin, destination } = await params;
    const board = await transitDataService.getRouteBoard(origin, destination);

    if (!board)
    {
        notFound();
    }

    const originCity = cityName(board.originName);
    const destinationCity = cityName(board.destinationName);
    const originCitySlug = citySlug(originCity);
    const destinationCitySlug = citySlug(destinationCity);
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: "Accueil", path: "/" },
            { name: "Villes et gares", path: "/villes" },
            { name: originCity, path: `/ville/${originCitySlug}` },
            { name: `${originCity} vers ${destinationCity}`, path: `/trajets/${board.originStopId}/${board.destinationStopId}` }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `Bus ${originCity} vers ${destinationCity}`,
            url: absoluteUrl(`/trajets/${board.originStopId}/${board.destinationStopId}`),
            about: {
                "@type": "BusTrip",
                departureBusStop: {
                    "@type": "BusStation",
                    name: board.originName,
                    url: absoluteUrl(`/gares/${encodeURIComponent(board.originStopId)}`)
                },
                arrivalBusStop: {
                    "@type": "BusStation",
                    name: board.destinationName,
                    url: absoluteUrl(`/gares/${encodeURIComponent(board.destinationStopId)}`)
                }
            }
        }
    ];

    return (
        <div className="page-shell listing-page">
            <nav className="breadcrumbs" aria-label="Fil d’Ariane">
                <Link href="/">Accueil</Link><span>›</span><Link href="/villes">Villes</Link><span>›</span><Link href={`/ville/${originCitySlug}`}>{originCity}</Link><span>›</span><span>{destinationCity}</span>
            </nav>
            <header className="listing-heading route-listing-heading">
                <span className="section-kicker">Horaires et retards</span>
                <h1>{originCity} <span>→</span> <em>{destinationCity}</em></h1>
                <p>{board.originName}<br />{board.destinationName}</p>
                <div className="route-station-links">
                    <Link href={`/gares/${encodeURIComponent(board.originStopId)}`}>Gare de départ</Link>
                    <Link href={`/ville/${destinationCitySlug}`}>Bus à {destinationCity}</Link>
                </div>
            </header>
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> Direct</span><h2>Bus disponibles</h2></div>
                    <span>{board.journeys.length} circulation{board.journeys.length > 1 ? "s" : ""}</span>
                </div>
                {board.journeys.length === 0 ? (
                    <div className="empty-state"><h2>Aucun départ dans le flux actuel</h2><p>Les prochains services apparaîtront automatiquement.</p></div>
                ) : (
                    <div className="journey-list">{board.journeys.map((journey) =>
                    {
                        return (
                            <JourneyCard
                                destinationStopId={board.destinationStopId}
                                journey={journey}
                                key={journey.journeyRef}
                                originStopId={board.originStopId}
                            />
                        );
                    })}</div>
                )}
            </section>
            <StructuredData value={structuredData} />
        </div>
    );
}
