import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JourneyCard } from "../../../components/journey-card";
import { OperatorLogo } from "../../../components/operator-logo";
import { SearchBox } from "../../../components/search-box";
import { StructuredData } from "../../../components/structured-data";
import { citySlug, type JourneyView } from "../../../src/application/journey-view";
import { blablacarBusOperator, flixBusOperator } from "../../../src/application/operators";
import { absoluteUrl, breadcrumbStructuredData } from "../../../src/application/seo";
import { groupStationJourneysByDate, stationDateHeading } from "../../../src/application/station-schedule";
import { transitDataService } from "../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ stopId: string }>;
    searchParams?: Promise<{ operateur?: string | string[] }>;
}

export const dynamic = "force-dynamic";

const getStopBoard = cache((stopId: string) => transitDataService.getStopBoard(stopId));

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const { stopId: rawStopId } = await params;
    const stopId = decodeURIComponent(rawStopId);
    const board = await getStopBoard(stopId);

    if (!board)
    {
        return { title: "Gare introuvable" };
    }

    return {
        title: `Bus à ${board.city} en temps réel : départs et retards`,
        description: `Consultez les prochains bus à ${board.name} et les retards BlaBlaCar Bus et FlixBus en temps réel.`,
        alternates: { canonical: `/gares/${encodeURIComponent(board.stopId)}` },
        openGraph: {
            title: `Bus à ${board.name} : horaires et retards en temps réel`,
            description: `Prochains départs BlaBlaCar Bus et FlixBus à ${board.city}, avec le temps réel disponible.`,
            type: "website",
            url: `/gares/${encodeURIComponent(board.stopId)}`
        },
        other: {
            "geo.position": `${board.latitude};${board.longitude}`,
            "geo.placename": board.city
        }
    };
}

export default async function StopPage({ params, searchParams }: PageProps)
{
    const { stopId: rawStopId } = await params;
    const stopId = decodeURIComponent(rawStopId);
    const board = await getStopBoard(stopId);

    if (!board)
    {
        notFound();
    }

    const slug = citySlug(board.city);
    const filters = await searchParams;
    const requestedOperator = Array.isArray(filters?.operateur)
        ? filters?.operateur[0]
        : filters?.operateur;
    const selectedOperator = board.operatorStops.some((operator) => operator.operatorSlug === requestedOperator)
        ? requestedOperator ?? null
        : null;
    const visibleJourneys = selectedOperator
        ? board.journeys.filter((journey) => journey.operatorSlug === selectedOperator)
        : board.journeys;
    const stopIdsByOperator = new Map(board.operatorStops.map((operator) =>
    {
        return [operator.operatorSlug, operator.stopId];
    }));
    const stationStopId = (journey: JourneyView): string =>
    {
        return stopIdsByOperator.get(journey.operatorSlug) ?? board.stopId;
    };
    const destinations = new Map<string, { originStopId: string; stopId: string; name: string; city: string }>();

    for (const journey of visibleJourneys)
    {
        const originStopId = stationStopId(journey);
        const originIndex = journey.stops.findIndex((stop) => stop.stopId === originStopId);

        for (const stop of journey.stops.slice(originIndex + 1))
        {
            destinations.set(`${originStopId}:${stop.stopId}`,
            {
                originStopId,
                stopId: stop.stopId,
                name: stop.name,
                city: stop.city
            });
        }
    }

    const destinationList = [...destinations.values()].slice(0, 12);
    const journeyGroups = groupStationJourneysByDate(visibleJourneys, stationStopId);
    const hasRealtime = board.operatorStops.some((operator) => operator.realtimeAvailable);
    const filterOperators = [blablacarBusOperator, flixBusOperator];

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
                <span className="section-kicker">{hasRealtime ? "Départs et retards en temps réel" : "Prochains départs"}</span>
                <h1>Bus à <em>{board.city}</em></h1>
                <p>{board.name}</p>
                <SearchBox compact initialQuery="" />
            </header>
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> {hasRealtime ? "Temps réel disponible" : "Horaires prévus"}</span><h2>Prochains bus à cette gare</h2></div>
                    <span>{visibleJourneys.length} passage{visibleJourneys.length > 1 ? "s" : ""} à venir</span>
                </div>
                <nav className="operator-filter" aria-label="Filtrer les horaires par compagnie">
                    <Link
                        aria-current={selectedOperator === null ? "page" : undefined}
                        className={selectedOperator === null ? "is-active" : ""}
                        href={`/gares/${encodeURIComponent(board.stopId)}`}
                    >
                        <strong>Toutes</strong>
                        <span>{board.operatorStops.length} compagnie{board.operatorStops.length > 1 ? "s" : ""}</span>
                    </Link>
                    {filterOperators.map((operator) =>
                    {
                        const station = board.operatorStops.find((candidate) => candidate.operatorSlug === operator.slug);

                        if (!station)
                        {
                            return (
                                <span className="is-disabled" key={operator.slug}>
                                    <OperatorLogo operatorSlug={operator.slug} />
                                    <small>Non desservi ici</small>
                                </span>
                            );
                        }

                        return (
                            <Link
                                aria-current={selectedOperator === operator.slug ? "page" : undefined}
                                className={selectedOperator === operator.slug ? "is-active" : ""}
                                href={`/gares/${encodeURIComponent(board.stopId)}?operateur=${operator.slug}`}
                                key={operator.slug}
                            >
                                <OperatorLogo operatorSlug={operator.slug} />
                                <span>{station.realtimeAvailable ? "Retards en temps réel" : "Horaires prévus"}</span>
                            </Link>
                        );
                    })}
                </nav>
                <div className="station-delay-legend" aria-label="Légende de l’état des bus">
                    <span className="late"><i /> Retard</span>
                    <span className="on-time"><i /> À l’heure</span>
                    <span className="early"><i /> En avance</span>
                    <span className="scheduled"><i /> Horaire prévu</span>
                </div>
                {visibleJourneys.length === 0 ? (
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
                                        {group.journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} stopId={stationStopId(journey)} />)}
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
                                <Link href={`/trajets/${encodeURIComponent(destination.originStopId)}/${encodeURIComponent(destination.stopId)}`} key={`${destination.originStopId}:${destination.stopId}`}>
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
