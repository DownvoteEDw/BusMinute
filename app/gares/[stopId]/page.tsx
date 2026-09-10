import { transitMetadata } from "../../transit-metadata";
import { JourneyUpdates } from "../../../components/journey-updates";
import { TransitPage } from "../../../components/transit-page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JourneyCard } from "../../../components/journey-card";
import { OperatorLogo } from "../../../components/operator-logo";
import { SearchBox } from "../../../components/search-box";
import { StructuredData } from "../../../components/structured-data";
import { countLabel, localize, type Locale } from "../../../src/application/i18n";
import { citySlug, type JourneyView } from "../../../src/application/journey-view";
import { alsaOperator, blablacarBusOperator, flixBusOperator } from "../../../src/application/operators";
import { requestLocale } from "../../request-locale";
import { absoluteUrl, breadcrumbStructuredData } from "../../../src/application/seo";
import { groupStationJourneysByDate, stationDateHeading } from "../../../src/application/station-schedule";
import { transitPageDataService } from "../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ stopId: string }>;
    searchParams?: Promise<{ operateur?: string | string[] }>;
}

export const dynamic = "force-dynamic";

const getStopBoard = cache((stopId: string) => transitPageDataService.getStopBoard(stopId));

export async function generateMetadata(props: PageProps): Promise<Metadata>
{
    const { stopId } = await props.params;
    return transitMetadata(() => loadMetadata(props), `/gares/${encodeURIComponent(stopId)}`);
}

async function loadMetadata({ params }: PageProps): Promise<Metadata>
{
    const locale = await requestLocale();
    const { stopId: rawStopId } = await params;
    const stopId = decodeURIComponent(rawStopId);
    const board = await getStopBoard(stopId);

    if (!board)
    {
        return { title: localize(locale, "Gare introuvable", "Station not found", "Estación no encontrada") };
    }

    return {
        title: localize(locale, `Bus à ${board.city} en temps réel : départs et retards`, `Live buses in ${board.city}: departures and delays`, `Autobuses en tiempo real en ${board.city}: salidas y retrasos`),
        description: localize(
            locale,
            `Consultez les prochains bus à ${board.name} pour BlaBlaCar Bus, FlixBus et Alsa, avec les retards disponibles en temps réel.`,
            `Check upcoming BlaBlaCar Bus, FlixBus and Alsa services at ${board.name}, with live delays when available.`,
            `Consulta las próximas salidas de BlaBlaCar Bus, FlixBus y Alsa en ${board.name}, con retrasos en tiempo real cuando estén disponibles.`
        ),
        alternates: { canonical: `/gares/${encodeURIComponent(board.stopId)}` },
        openGraph: {
            title: localize(locale, `Bus à ${board.name} : horaires et retards en temps réel`, `Buses at ${board.name}: live times and delays`, `Autobuses en ${board.name}: horarios y retrasos en tiempo real`),
            description: localize(
                locale,
                `Prochains départs BlaBlaCar Bus, FlixBus et Alsa à ${board.city}, avec le temps réel disponible.`,
                `Upcoming BlaBlaCar Bus, FlixBus and Alsa departures in ${board.city}, with live updates when available.`,
                `Próximas salidas de BlaBlaCar Bus, FlixBus y Alsa en ${board.city}, con datos en tiempo real cuando estén disponibles.`
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
    const { stopId } = await params;
    if (!await transitPageDataService.hasStop(decodeURIComponent(stopId)))
    {
        notFound();
    }
    return (
        <TransitPage key={JSON.stringify(await params)} locale={locale} title={localize(locale, "Votre gare", "Your station", "Tu estación")}>
            <StopPageContent params={params} searchParams={searchParams} locale={locale} />
        </TransitPage>
    );
}

async function StopPageContent({ params, searchParams, locale }: PageProps & { locale: Locale })
{
    const { stopId: rawStopId } = await params;
    const stopId = decodeURIComponent(rawStopId);
    const board = await getStopBoard(stopId);

    if (!board)
    {
        throw new Error("Horaires de la gare indisponibles");
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
    const filterOperators = [blablacarBusOperator, flixBusOperator, alsaOperator];

    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: localize(locale, "Accueil", "Home", "Inicio"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations", "Ciudades y estaciones"), path: "/villes" },
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
        <JourneyUpdates journeys={visibleJourneys}>
            <div className="page-shell listing-page">
                <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb", "Migas de pan")}>
                    <Link href="/">{localize(locale, "Accueil", "Home", "Inicio")}</Link><span>›</span><Link href="/villes">{localize(locale, "Villes", "Cities", "Ciudades")}</Link><span>›</span><Link href={`/ville/${slug}`}>{board.city}</Link><span>›</span><span>{board.name}</span>
                </nav>
                <header className="listing-heading">
                    <span className="section-kicker">{hasRealtime
                        ? localize(locale, "Départs et retards en temps réel", "Live departures and delays", "Salidas y retrasos en tiempo real")
                        : localize(locale, "Prochains départs", "Upcoming departures", "Próximas salidas")}</span>
                    <h1>{localize(locale, "Bus à", "Buses in", "Autobuses en")} <em>{board.city}</em></h1>
                    <p>{board.name}</p>
                    <SearchBox compact initialQuery="" locale={locale} />
                </header>
                <section className="journey-list-section">
                    <div className="section-heading-row">
                        <div><span className="live-pill light"><i /> {hasRealtime ? localize(locale, "Temps réel disponible", "Live data available", "Datos en tiempo real disponibles") : localize(locale, "Horaires prévus", "Scheduled times", "Horarios previstos")}</span><h2>{localize(locale, "Prochains bus à cette gare", "Upcoming buses at this station", "Próximos autobuses en esta estación")}</h2></div>
                        <span>{countLabel(locale, visibleJourneys.length, "passage à venir", "passages à venir", "upcoming service", "upcoming services", "próximo servicio", "próximos servicios")}</span>
                    </div>
                    <nav className="operator-filter" aria-label={localize(locale, "Filtrer les horaires par compagnie", "Filter times by operator", "Filtrar horarios por operador")}>
                        <Link
                            aria-current={selectedOperator === null ? "page" : undefined}
                            className={selectedOperator === null ? "is-active" : ""}
                            href={`/gares/${encodeURIComponent(board.stopId)}`}
                        >
                            <strong>{localize(locale, "Toutes", "All", "Todas")}</strong>
                            <span>{countLabel(locale, board.operatorStops.length, "compagnie", "compagnies", "operator", "operators", "compañía", "compañías")}</span>
                        </Link>
                        {filterOperators.map((operator) =>
                        {
                            const station = board.operatorStops.find((candidate) => candidate.operatorSlug === operator.slug);

                            if (!station)
                            {
                                return (
                                    <span className="is-disabled" key={operator.slug}>
                                        <OperatorLogo operatorSlug={operator.slug} />
                                        <small>{localize(locale, "Non desservi ici", "Not served here", "Sin servicio aquí")}</small>
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
                                    <span>{station.realtimeAvailable ? localize(locale, "Retards en temps réel", "Live delays", "Retrasos en tiempo real") : localize(locale, "Horaires prévus", "Scheduled times", "Horarios previstos")}</span>
                                </Link>
                            );
                        })}
                    </nav>
                    <div className="station-delay-legend" aria-label={localize(locale, "Légende de l’état des bus", "Bus status key", "Leyenda del estado de los autobuses")}>
                        <span className="late"><i /> {localize(locale, "Retard", "Delayed", "Con retraso")}</span>
                        <span className="on-time"><i /> {localize(locale, "À l’heure", "On time", "Puntual")}</span>
                        <span className="early"><i /> {localize(locale, "En avance", "Early", "Adelantado")}</span>
                        <span className="scheduled"><i /> {localize(locale, "Horaire prévu", "Scheduled", "Horario previsto")}</span>
                    </div>
                    {visibleJourneys.length === 0 ? (
                        <div className="empty-state"><h2>{localize(locale, "Aucun passage à venir", "No upcoming services", "No hay próximos servicios")}</h2><p>{localize(locale, "Les prochains horaires ne sont pas encore disponibles.", "Upcoming times are not available yet.", "Los próximos horarios todavía no están disponibles.")}</p></div>
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
                                            <span>{countLabel(locale, group.journeys.length, "passage", "passages", "service", "services", "servicio", "servicios")}</span>
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
                            <h2>{localize(locale, "Liaisons depuis cette gare", "Routes from this station", "Destinos desde esta estación")}</h2>
                            <span>{countLabel(locale, destinationList.length, "destination", "destinations", "destination", "destinations", "destino", "destinos")}</span>
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
        </JourneyUpdates>
    );
}
