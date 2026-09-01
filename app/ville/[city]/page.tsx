import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyCard } from "../../../components/journey-card";
import { SearchBox } from "../../../components/search-box";
import { StructuredData } from "../../../components/structured-data";
import { absoluteUrl, breadcrumbStructuredData } from "../../../src/application/seo";
import { transitDataService } from "../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ city: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const { city } = await params;
    const board = await transitDataService.getCityBoard(city);

    if (!board)
    {
        return { title: "Ville introuvable" };
    }

    return {
        title: `Bus à ${board.name} : gares, départs et retards`,
        description: `Trouvez les gares routières de ${board.name} et suivez les départs BlaBlaCar Bus avec leurs horaires et retards actualisés.`,
        alternates: {
            canonical: `/ville/${board.slug}`
        }
    };
}

export default async function CityPage({ params }: PageProps)
{
    const { city } = await params;
    const board = await transitDataService.getCityBoard(city);

    if (!board)
    {
        notFound();
    }

    const dates = [...new Set(board.journeys.map((journey) => journey.serviceDate))].sort();
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: "Accueil", path: "/" },
            { name: "Villes et gares", path: "/villes" },
            { name: board.name, path: `/ville/${board.slug}` }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `Bus et gares routières à ${board.name}`,
            url: absoluteUrl(`/ville/${board.slug}`),
            mainEntity: {
                "@type": "ItemList",
                numberOfItems: board.stops.length,
                itemListElement: board.stops.map((stop, index) =>
                {
                    return {
                        "@type": "ListItem",
                        position: index + 1,
                        item: {
                            "@type": "BusStation",
                            name: stop.name,
                            url: absoluteUrl(`/gares/${encodeURIComponent(stop.stopId)}`),
                            geo: {
                                "@type": "GeoCoordinates",
                                latitude: stop.latitude,
                                longitude: stop.longitude
                            }
                        }
                    };
                })
            }
        }
    ];

    return (
        <div className="page-shell city-page">
            <nav className="breadcrumbs" aria-label="Fil d’Ariane">
                <Link href="/">Accueil</Link><span>›</span><Link href="/villes">Villes</Link><span>›</span><span>{board.name}</span>
            </nav>
            <header className="listing-heading city-heading">
                <span className="section-kicker">Gares et départs en direct</span>
                <h1>Bus à <em>{board.name}</em></h1>
                <p>{board.stops.length} gare{board.stops.length > 1 ? "s routières" : " routière"} référencée{board.stops.length > 1 ? "s" : ""}.</p>
                <SearchBox compact initialQuery="" />
            </header>
            <section className="station-section">
                <div className="section-heading-row">
                    <h2>Gares routières à {board.name}</h2>
                    <span>Classées par nombre de bus à venir</span>
                </div>
                <div className="station-grid">
                    {board.stops.map((stop, index) =>
                    {
                        const isPrimary = index === 0 && stop.upcomingJourneyCount > 0;

                        return (
                            <Link className={`station-card${isPrimary ? " is-primary" : ""}`} href={`/gares/${encodeURIComponent(stop.stopId)}`} key={stop.stopId}>
                                <span className="station-card-top">
                                    <span className="station-card-code">Gare · {stop.stopId}</span>
                                    {isPrimary && <span className="station-card-popular">La plus active</span>}
                                </span>
                                <span className="station-card-main">
                                    <span className="station-card-name">
                                        <strong>{shortStationName(stop.name, board.name)}</strong>
                                        <small>{stop.name}</small>
                                    </span>
                                    <span className="station-card-activity">
                                        <b>{stop.upcomingJourneyCount}</b>
                                        <span>bus à venir</span>
                                    </span>
                                </span>
                                <span className="station-card-footer">
                                    <span>{stop.nextJourneyAt ? `Prochain passage à ${formatTime(stop.nextJourneyAt)}` : "Aucun passage annoncé"}</span>
                                    <strong>Voir la gare <b aria-hidden="true">›</b></strong>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </section>
            {dates.length > 0 && (
                <section className="date-links-section">
                    <h2>Départs par date</h2>
                    <div className="date-links">
                        {dates.map((date) =>
                        {
                            return <Link href={`/departs/${board.slug}/${date}`} key={date}>{formatDate(date)}</Link>;
                        })}
                    </div>
                </section>
            )}
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> Direct</span><h2>Bus passant par {board.name}</h2></div>
                    <span>{board.journeys.length} circulation{board.journeys.length > 1 ? "s" : ""}</span>
                </div>
                {board.journeys.length === 0 ? (
                    <div className="empty-state"><h2>Aucun bus dans le flux actuel</h2><p>Les prochaines circulations apparaîtront automatiquement.</p></div>
                ) : (
                    <div className="journey-list">{board.journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} />)}</div>
                )}
            </section>
            <StructuredData value={structuredData} />
        </div>
    );
}

function formatDate(value: string): string
{
    return new Intl.DateTimeFormat("fr-FR",
    {
        dateStyle: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(value: string): string
{
    return new Intl.DateTimeFormat("fr-FR",
    {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Paris"
    }).format(new Date(value));
}

function shortStationName(name: string, city: string): string
{
    const prefix = `${city} - `;
    return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}
