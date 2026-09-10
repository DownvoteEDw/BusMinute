import type { Metadata } from "next";
import Link from "next/link";
import { TransitSection } from "../../components/transit-section";
import { JourneyCard } from "../../components/journey-card";
import { SearchBox } from "../../components/search-box";
import { countLabel, localize, type Locale } from "../../src/application/i18n";
import { requestLocale } from "../request-locale";
import { transitPageDataService } from "../../src/application/transit-data-service";

interface PageProps
{
    searchParams: Promise<{ q?: string | string[] }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata>
{
    const locale = await requestLocale();
    return {
        title: localize(locale, "Rechercher un bus", "Search for a bus", "Buscar un autobús"),
        robots: { index: false, follow: true }
    };
}

export default async function SearchPage({ searchParams }: PageProps)
{
    const locale = await requestLocale();
    const values = await searchParams;
    const query = typeof values.q === "string" ? values.q : "";

    return (
        <div className="page-shell listing-page search-page">
            <header className="listing-heading">
                <span className="section-kicker">{localize(locale, "Recherche", "Search", "Búsqueda")}</span>
                <h1>{localize(locale, "Trouver", "Find", "Encuentra")} <em>{localize(locale, "votre bus", "your bus", "tu autobús")}</em></h1>
                <SearchBox compact initialQuery={query} locale={locale} />
            </header>
            <TransitSection locale={locale} key={`places:${query}`}>
                <SearchPlaces query={query} locale={locale} />
            </TransitSection>
            <TransitSection locale={locale} key={`journeys:${query}`}>
                <SearchJourneys query={query} locale={locale} />
            </TransitSection>
        </div>
    );
}

async function SearchPlaces({ query, locale }: { query: string; locale: Locale })
{
    const places = query.length >= 2 ? await transitPageDataService.searchPlaces(query, 20) : [];
    return (
        <>
            {places.length > 0 && (
                <section className="place-results-section">
                    <div className="section-heading-row">
                        <h2>{localize(locale, "Villes et gares", "Cities and stations", "Ciudades y estaciones")}</h2>
                        <span>{countLabel(locale, places.length, "lieu", "lieux", "place", "places", "lugar", "lugares")}</span>
                    </div>
                    <div className="place-card-grid">
                        {places.map((place) =>
                        {
                            return (
                                <Link className="place-card" href={place.href} key={`${place.type}-${place.id}`}>
                                    <span>{place.type === "city" ? localize(locale, "Ville", "City", "Ciudad") : localize(locale, "Gare", "Station", "Estación")}</span>
                                    <strong>{place.label}</strong>
                                    <small>{placeDetail(place.type, place.detail, locale)}</small>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}
        </>
    );
}

async function SearchJourneys({ query, locale }: { query: string; locale: Locale })
{
    const journeys = query.length >= 2 ? await transitPageDataService.search(query, 40) : [];
    return (
        <section className="journey-list-section">
            <div className="section-heading-row">
                <h2>{countLabel(locale, journeys.length, "résultat", "résultats", "result", "results", "resultado", "resultados")}</h2>
            </div>
            {journeys.length === 0 ? (
                <div className="empty-state"><h2>{localize(locale, "Aucun bus trouvé aujourd’hui", "No buses found today", "No hemos encontrado autobuses para hoy")}</h2><p>{localize(locale, "Essayez un numéro, une ville ou un trajet comme Paris → Tours.", "Try a bus number, city or route such as Paris → Tours.", "Prueba con un número, una ciudad o una ruta como París → Tours.")}</p></div>
            ) : (
                <div className="journey-list">{journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} locale={locale} />)}</div>
            )}
        </section>
    );
}

function placeDetail(type: "city" | "stop", detail: string, locale: Locale): string
{
    if (locale === "fr" || type !== "city")
    {
        return detail;
    }

    const count = Number.parseInt(detail, 10);
    return Number.isFinite(count)
        ? countLabel(locale, count, "gare", "gares", "station", "stations", "estación", "estaciones")
        : detail;
}
