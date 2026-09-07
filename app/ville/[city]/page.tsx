import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CityJourneyList } from "../../../components/city-journey-list";
import { OperatorLogo } from "../../../components/operator-logo";
import { SearchBox } from "../../../components/search-box";
import { StructuredData } from "../../../components/structured-data";
import { countLabel, localeTag, localize, type Locale } from "../../../src/application/i18n";
import { requestLocale } from "../../request-locale";
import { absoluteUrl, breadcrumbStructuredData } from "../../../src/application/seo";
import { transitDataService } from "../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ city: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const locale = await requestLocale();
    const { city } = await params;
    const board = await transitDataService.getCityBoard(city);

    if (!board)
    {
        return { title: localize(locale, "Ville introuvable", "City not found", "Ciudad no encontrada") };
    }

    return {
        title: localize(locale, `Bus à ${board.name} en temps réel : gares et départs`, `Live buses in ${board.name}: stations and departures`, `Autobuses en tiempo real en ${board.name}: estaciones y salidas`),
        description: localize(
            locale,
            `Trouvez les gares routières de ${board.name}, les prochains BlaBlaCar Bus, FlixBus et Alsa, avec les retards disponibles en temps réel.`,
            `Find coach stations in ${board.name}, upcoming BlaBlaCar Bus, FlixBus and Alsa services, with live delays when available.`,
            `Encuentra las estaciones de autobuses de ${board.name} y las próximas salidas de BlaBlaCar Bus, FlixBus y Alsa, con retrasos en tiempo real cuando estén disponibles.`
        ),
        alternates: {
            canonical: `/ville/${board.slug}`
        }
    };
}

export default async function CityPage({ params }: PageProps)
{
    const locale = await requestLocale();
    const { city } = await params;
    const board = await transitDataService.getCityBoard(city);

    if (!board)
    {
        notFound();
    }

    const today = parisDate(new Date());
    const dates = nextDates(today, 3);
    const initialPage = await transitDataService.getCityJourneyPage(board.slug, today);

    if (!initialPage)
    {
        notFound();
    }
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: localize(locale, "Accueil", "Home", "Inicio"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations", "Ciudades y estaciones"), path: "/villes" },
            { name: board.name, path: `/ville/${board.slug}` }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: localize(locale, `Bus et gares routières à ${board.name}`, `Buses and coach stations in ${board.name}`, `Autobuses y estaciones en ${board.name}`),
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
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb", "Migas de pan")}>
                <Link href="/">{localize(locale, "Accueil", "Home", "Inicio")}</Link><span>›</span><Link href="/villes">{localize(locale, "Villes", "Cities", "Ciudades")}</Link><span>›</span><span>{board.name}</span>
            </nav>
            <header className="listing-heading city-heading">
                <span className="section-kicker">{localize(locale, "Départs et retards en temps réel", "Live departures and delays", "Salidas y retrasos en tiempo real")}</span>
                <h1>{localize(locale, "Bus à", "Buses in", "Autobuses en")} <em>{board.name}</em></h1>
                <p>{localize(
                    locale,
                    `${board.stops.length} gare${board.stops.length > 1 ? "s routières" : " routière"} référencée${board.stops.length > 1 ? "s" : ""}.`,
                    `${countLabel(locale, board.stops.length, "gare", "gares", "coach station", "coach stations", "estación", "estaciones")} listed.`,
                    `${countLabel(locale, board.stops.length, "gare", "gares", "coach station", "coach stations", "estación", "estaciones")} registradas.`
                )}</p>
                <SearchBox compact initialQuery="" locale={locale} />
            </header>
            <section className="station-section">
                <div className="section-heading-row">
                    <h2>{localize(locale, `Gares routières à ${board.name}`, `Coach stations in ${board.name}`, `Estaciones de autobuses en ${board.name}`)}</h2>
                    <span>{localize(locale, "Classées par nombre de bus à venir", "Sorted by upcoming buses", "Ordenadas por número de próximas salidas")}</span>
                </div>
                <div className="station-grid">
                    {board.stops.map((stop, index) =>
                    {
                        const isPrimary = index === 0 && stop.upcomingJourneyCount > 0;

                        return (
                            <Link className={`station-card${isPrimary ? " is-primary" : ""}`} href={`/gares/${encodeURIComponent(stop.stopId)}`} key={stop.stopId}>
                                <span className="station-card-top">
                                    <span className="station-card-code">
                                        {stop.operatorSlugs.map((operatorSlug) =>
                                        {
                                            return <OperatorLogo key={operatorSlug} operatorSlug={operatorSlug} />;
                                        })}
                                        <small>{localize(locale, "Gare routière", "Coach station", "Estación de autobuses")}</small>
                                    </span>
                                    {isPrimary && <span className="station-card-popular">{localize(locale, "La plus active", "Most active", "La más activa")}</span>}
                                </span>
                                <span className="station-card-main">
                                    <span className="station-card-name">
                                        <strong>{shortStationName(stop.name, board.name)}</strong>
                                        <small>{stop.name}</small>
                                    </span>
                                    <span className="station-card-activity">
                                        <b>{stop.upcomingJourneyCount}</b>
                                        <span>{localize(locale, "bus à venir", stop.upcomingJourneyCount === 1 ? "upcoming bus" : "upcoming buses", stop.upcomingJourneyCount === 1 ? "autobús próximo" : "autobuses próximos")}</span>
                                    </span>
                                </span>
                                <span className="station-card-footer">
                                    <span>{stop.nextJourneyAt
                                        ? localize(locale, `Prochain passage à ${formatTime(stop.nextJourneyAt, locale)}`, `Next service at ${formatTime(stop.nextJourneyAt, locale)}`, `Próxima salida a las ${formatTime(stop.nextJourneyAt, locale)}`)
                                        : localize(locale, "Aucun passage annoncé", "No service announced", "No hay salidas anunciadas")}</span>
                                    <strong>{localize(locale, "Voir la gare", "View station", "Ver la estación")} <b aria-hidden="true">›</b></strong>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </section>
            {dates.length > 0 && (
                <section className="date-links-section">
                    <h2>{localize(locale, "Départs par date", "Departures by date", "Salidas por fecha")}</h2>
                    <div className="date-links">
                        {dates.map((date) =>
                        {
                            return (
                                <Link className={date === today ? "is-current" : undefined} href={`/departs/${board.slug}/${date}`} key={date}>
                                    {dateLinkLabel(date, today, locale)}
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> {localize(locale, "Temps réel disponible", "Live data available", "Datos en tiempo real disponibles")}</span><h2>{localize(locale, `Bus passant par ${board.name} aujourd’hui`, `Buses calling at ${board.name} today`, `Autobuses que pasan hoy por ${board.name}`)}</h2></div>
                    <span>{countLabel(locale, initialPage.totalCount, "passage", "passages", "service", "services", "servicio", "servicios")}</span>
                </div>
                <CityJourneyList citySlug={board.slug} initialPage={initialPage} locale={locale} serviceDate={today} />
            </section>
            <StructuredData value={structuredData} />
        </div>
    );
}

function dateLinkLabel(value: string, today: string, locale: Locale): string
{
    const tomorrow = addDays(today, 1);
    const relative = value === today
        ? localize(locale, "Aujourd’hui", "Today", "Hoy")
        : value === tomorrow
            ? localize(locale, "Demain", "Tomorrow", "Mañana")
            : null;
    const date = new Intl.DateTimeFormat(localeTag(locale),
    {
        day: "numeric",
        month: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
    return relative ? `${relative} · ${date}` : date;
}

function formatTime(value: string, locale: Locale): string
{
    return new Intl.DateTimeFormat(localeTag(locale),
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

function nextDates(firstDate: string, count: number): string[]
{
    return Array.from({ length: count }, (_, index) => addDays(firstDate, index));
}

function addDays(value: string, days: number): string
{
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function parisDate(value: Date): string
{
    const parts = new Intl.DateTimeFormat("fr-FR",
    {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Paris"
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
    {
        return parts.find((candidate) => candidate.type === type)?.value ?? "";
    };
    return `${part("year")}-${part("month")}-${part("day")}`;
}
