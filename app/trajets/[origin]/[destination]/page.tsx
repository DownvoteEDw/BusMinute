import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyCard } from "../../../../components/journey-card";
import { StructuredData } from "../../../../components/structured-data";
import { countLabel, localize } from "../../../../src/application/i18n";
import { cityName, citySlug } from "../../../../src/application/journey-view";
import { requestLocale } from "../../../request-locale";
import { absoluteUrl, breadcrumbStructuredData } from "../../../../src/application/seo";
import { transitDataService } from "../../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ origin: string; destination: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const locale = await requestLocale();
    const { origin, destination } = await params;
    const board = await transitDataService.getRouteBoard(origin, destination);

    if (!board)
    {
        return { title: localize(locale, "Trajet introuvable", "Route not found") };
    }

    const originCity = cityName(board.originName);
    const destinationCity = cityName(board.destinationName);

    return {
        title: localize(locale, `Bus ${originCity} → ${destinationCity} : horaires et retards`, `Bus ${originCity} → ${destinationCity}: times and delays`),
        description: localize(
            locale,
            `Suivez les bus ${originCity} vers ${destinationCity}, leurs horaires réels et les retards signalés.`,
            `Track buses from ${originCity} to ${destinationCity}, with live times and reported delays.`
        ),
        alternates: { canonical: `/trajets/${board.originStopId}/${board.destinationStopId}` },
        robots: {
            index: board.journeys.length > 0,
            follow: true
        }
    };
}

export default async function RoutePage({ params }: PageProps)
{
    const locale = await requestLocale();
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
            { name: localize(locale, "Accueil", "Home"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations"), path: "/villes" },
            { name: originCity, path: `/ville/${originCitySlug}` },
            { name: localize(locale, `${originCity} vers ${destinationCity}`, `${originCity} to ${destinationCity}`), path: `/trajets/${board.originStopId}/${board.destinationStopId}` }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: localize(locale, `Bus ${originCity} vers ${destinationCity}`, `Bus ${originCity} to ${destinationCity}`),
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
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb")}>
                <Link href="/">{localize(locale, "Accueil", "Home")}</Link><span>›</span><Link href="/villes">{localize(locale, "Villes", "Cities")}</Link><span>›</span><Link href={`/ville/${originCitySlug}`}>{originCity}</Link><span>›</span><span>{destinationCity}</span>
            </nav>
            <header className="listing-heading route-listing-heading">
                <span className="section-kicker">{localize(locale, "Horaires et retards", "Times and delays")}</span>
                <h1>{originCity} <span>→</span> <em>{destinationCity}</em></h1>
                <p>{board.originName}<br />{board.destinationName}</p>
                <div className="route-station-links">
                    <Link href={`/gares/${encodeURIComponent(board.originStopId)}`}>{localize(locale, "Gare de départ", "Departure station")}</Link>
                    <Link href={`/ville/${destinationCitySlug}`}>{localize(locale, `Bus à ${destinationCity}`, `Buses in ${destinationCity}`)}</Link>
                </div>
            </header>
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> {localize(locale, "Temps réel", "Live")}</span><h2>{localize(locale, "Bus disponibles", "Available buses")}</h2></div>
                    <span>{countLabel(locale, board.journeys.length, "trajet", "trajets", "journey", "journeys")}</span>
                </div>
                {board.journeys.length === 0 ? (
                    <div className="empty-state"><h2>{localize(locale, "Aucun départ à venir", "No upcoming departures")}</h2><p>{localize(locale, "Les prochains horaires apparaîtront automatiquement.", "Upcoming times will appear automatically.")}</p></div>
                ) : (
                    <div className="journey-list">{board.journeys.map((journey) =>
                    {
                        return (
                            <JourneyCard
                                destinationStopId={board.destinationStopId}
                                journey={journey}
                                key={journey.journeyRef}
                                locale={locale}
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
