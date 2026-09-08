import Link from "next/link";
import { JourneyCard } from "./journey-card";
import { StructuredData } from "./structured-data";
import { busServicePath, cityRoutePath } from "../src/application/journey-url";
import { citySlug, type JourneyView } from "../src/application/journey-view";
import { localize, type Locale } from "../src/application/i18n";
import { absoluteUrl, breadcrumbStructuredData } from "../src/application/seo";

export function CityRoutePage({ board, origin, destination, locale }: {
    board: { originCity: string; destinationCity: string; journeys: JourneyView[] };
    origin: string;
    destination: string;
    locale: Locale;
})
{
    const services = [...new Map(board.journeys.map((journey) => [busServicePath(journey), journey])).entries()];
    return (
        <div className="page-shell listing-page">
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb", "Migas de pan")}>
                <Link href="/">{localize(locale, "Accueil", "Home", "Inicio")}</Link><span>›</span><Link href={`/ville/${origin}`}>{board.originCity}</Link><span>›</span><span>{board.destinationCity}</span>
            </nav>
            <header className="listing-heading">
                <span className="section-kicker">{localize(locale, "Toutes les gares et compagnies disponibles", "All available stations and operators", "Todas las estaciones y compañías disponibles")}</span>
                <h1>{board.originCity} <span>→</span> <em>{board.destinationCity}</em></h1>
                <p>{localize(locale, "Choisissez votre départ et vérifiez la gare indiquée sur votre billet.", "Choose your departure and check the station shown on your ticket.", "Elige la salida y comprueba la estación indicada en tu billete.")}</p>
            </header>
            <section className="journey-list-section">
                <h2>{localize(locale, "Départs et bus en cours de trajet", "Departures and buses on their way", "Salidas y autobuses en ruta")}</h2>
                <div className="journey-list">{board.journeys.map((journey) =>
                {
                    const start = journey.stops.findIndex((stop) => citySlug(stop.city) === origin);
                    const end = journey.stops.find((stop, index) => index > start && citySlug(stop.city) === destination);
                    return <JourneyCard journey={journey} key={journey.journeyRef} locale={locale} originStopId={journey.stops[start]?.stopId} destinationStopId={end?.stopId} />;
                })}</div>
                {board.journeys.length === 0 && <div className="empty-state"><h2>{localize(locale, "Aucun départ annoncé", "No departures announced", "No hay salidas anunciadas")}</h2><Link href={`/ville/${origin}`}>{localize(locale, `Voir les départs de ${board.originCity}`, `View departures from ${board.originCity}`, `Ver las salidas de ${board.originCity}`)}</Link></div>}
            </section>
            {services.length > 0 && <section className="journey-list-section"><h2>{localize(locale, "Retrouver un service de bus", "Find a bus service", "Encontrar un servicio de autobús")}</h2><div className="route-station-links">{services.map(([path, journey]) => <Link key={path} href={path}>{journey.operatorName} {journey.serviceNumber}</Link>)}</div></section>}
            <StructuredData value={[breadcrumbStructuredData([{ name: "BusMinute", path: "/" }, { name: `${board.originCity} → ${board.destinationCity}`, path: cityRoutePath(origin, destination) }]), { "@context": "https://schema.org", "@type": "CollectionPage", name: `${board.originCity} → ${board.destinationCity}`, url: absoluteUrl(cityRoutePath(origin, destination)) }]} />
        </div>
    );
}
