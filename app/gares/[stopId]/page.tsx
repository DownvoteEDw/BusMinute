import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JourneyCard } from "../../../components/journey-card";
import { OperatorLogo } from "../../../components/operator-logo";
import { SearchBox } from "../../../components/search-box";
import { StructuredData } from "../../../components/structured-data";
import { countLabel, localize } from "../../../src/application/i18n";
import { citySlug, type JourneyView } from "../../../src/application/journey-view";
import { blablacarBusOperator, flixBusOperator } from "../../../src/application/operators";
import { requestLocale } from "../../request-locale";
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
    const locale = await requestLocale();
    const { stopId: rawStopId } = await params;
    const stopId = decodeURIComponent(rawStopId);
    const board = await getStopBoard(stopId);

    if (!board)
    {
        return { title: localize(locale, "Gare introuvable", "Station not found") };
    }

    return {
        title: localize(locale, `Bus à ${board.city} en temps réel : départs et retards`, `Live buses in ${board.city}: departures and delays`),
        description: localize(
            locale,
            `Consultez les prochains bus à ${board.name} et les retards BlaBlaCar Bus et FlixBus en temps réel.`,
            `Check upcoming buses at ${board.name} and live BlaBlaCar Bus and FlixBus delays.`
        ),
        alternates: { canonical: `/gares/${encodeURIComponent(board.stopId)}` },
        openGraph: {
            title: localize(locale, `Bus à ${board.name} : horaires et retards en temps réel`, `Buses at ${board.name}: live times and delays`),
            description: localize(
                locale,
                `Prochains départs BlaBlaCar Bus et FlixBus à ${board.city}, avec le temps réel disponible.`,
                `Upcoming BlaBlaCar Bus and FlixBus departures in ${board.city}, with live updates when available.`
            ),
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
    const locale = await requestLocale();
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
            { name: localize(locale, "Accueil", "Home"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations"), path: "/villes" },
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
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb")}>
                <Link href="/">{localize(locale, "Accueil", "Home")}</Link><span>›</span><Link href="/villes">{localize(locale, "Villes", "Cities")}</Link><span>›</span><Link href={`/ville/${slug}`}>{board.city}</Link><span>›</span><span>{board.name}</span>
            </nav>
            <header className="listing-heading">
                <span className="section-kicker">{hasRealtime
                    ? localize(locale, "Départs et retards en temps réel", "Live departures and delays")
                    : localize(locale, "Prochains départs", "Upcoming departures")}</span>
                <h1>{localize(locale, "Bus à", "Buses in")} <em>{board.city}</em></h1>
                <p>{board.name}</p>
                <SearchBox compact initialQuery="" locale={locale} />
            </header>
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> {hasRealtime ? localize(locale, "Temps réel disponible", "Live data available") : localize(locale, "Horaires prévus", "Scheduled times")}</span><h2>{localize(locale, "Prochains bus à cette gare", "Upcoming buses at this station")}</h2></div>
                    <span>{countLabel(locale, visibleJourneys.length, "passage à venir", "passages à venir", "upcoming service", "upcoming services")}</span>
                </div>
                <nav className="operator-filter" aria-label={localize(locale, "Filtrer les horaires par compagnie", "Filter times by operator")}>
                    <Link
                        aria-current={selectedOperator === null ? "page" : undefined}
                        className={selectedOperator === null ? "is-active" : ""}
                        href={`/gares/${encodeURIComponent(board.stopId)}`}
                    >
                        <strong>{localize(locale, "Toutes", "All")}</strong>
                        <span>{countLabel(locale, board.operatorStops.length, "compagnie", "compagnies", "operator", "operators")}</span>
                    </Link>
                    {filterOperators.map((operator) =>
                    {
                        const station = board.operatorStops.find((candidate) => candidate.operatorSlug === operator.slug);

                        if (!station)
                        {
                            return (
                                <span className="is-disabled" key={operator.slug}>
                                    <OperatorLogo operatorSlug={operator.slug} />
                                    <small>{localize(locale, "Non desservi ici", "Not served here")}</small>
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
                                <span>{station.realtimeAvailable ? localize(locale, "Retards en temps réel", "Live delays") : localize(locale, "Horaires prévus", "Scheduled times")}</span>
                            </Link>
                        );
                    })}
                </nav>
                <div className="station-delay-legend" aria-label={localize(locale, "Légende de l’état des bus", "Bus status key")}>
                    <span className="late"><i /> {localize(locale, "Retard", "Delayed")}</span>
                    <span className="on-time"><i /> {localize(locale, "À l’heure", "On time")}</span>
                    <span className="early"><i /> {localize(locale, "En avance", "Early")}</span>
                    <span className="scheduled"><i /> {localize(locale, "Horaire prévu", "Scheduled")}</span>
                </div>
                {visibleJourneys.length === 0 ? (
                    <div className="empty-state"><h2>{localize(locale, "Aucun passage à venir", "No upcoming services")}</h2><p>{localize(locale, "Les prochains horaires ne sont pas encore disponibles.", "Upcoming times are not available yet.")}</p></div>
                ) : (
                    <div className="station-journey-groups">
                        {journeyGroups.map((group) =>
                        {
                            const heading = stationDateHeading(group.date, new Date(), locale);

                            return (
                                <section className="station-journey-group" key={group.date}>
                                    <div className="station-date-heading">
                                        <h3>
                                            {heading.relative && <span>{heading.relative}</span>}
                                            <time dateTime={group.date}>{heading.full}</time>
                                        </h3>
                                        <span>{countLabel(locale, group.journeys.length, "passage", "passages", "service", "services")}</span>
                                    </div>
                                    <div className="journey-list">
                                        {group.journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} locale={locale} stopId={stationStopId(journey)} />)}
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
                        <h2>{localize(locale, "Liaisons depuis cette gare", "Routes from this station")}</h2>
                        <span>{countLabel(locale, destinationList.length, "destination", "destinations", "destination", "destinations")}</span>
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
