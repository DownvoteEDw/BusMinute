import type { Metadata } from "next";
import Link from "next/link";
import { TransitSection } from "../components/transit-section";
import { LiveDeparturesBoard } from "../components/live-departures-board";
import { SearchBox } from "../components/search-box";
import { countLabel, localize, type Locale } from "../src/application/i18n";
import { requestLocale } from "./request-locale";
import { transitPageDataService } from "../src/application/transit-data-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    alternates: {
        canonical: "/"
    }
};

export default async function HomePage()
{
    const locale = await requestLocale();

    return (
        <>
            <section className="hero">
                <div className="hero-copy">
                    <span className="eyebrow">{localize(locale, "Vos départs, minute par minute", "Departures, minute by minute", "Salidas al minuto")}</span>
                    <h1>{localize(locale, "Votre bus.", "Your bus.", "Tu autobús.")}<br /><em>{localize(locale, "En temps réel.", "Live.", "En tiempo real.")}</em></h1>
                    <p>{localize(
                        locale,
                        "Trouvez un trajet ou un numéro de bus et consultez les prochains passages comme sur le panneau de votre gare.",
                        "Find a route or bus number and check upcoming services just like on the departure board at your station.",
                        "Busca una ruta o un número de autobús y consulta las próximas salidas como en el panel de tu estación."
                    )}</p>
                    <SearchBox locale={locale} />
                    <div className="trust-row">
                        <span><b>{localize(locale, "3 opérateurs", "3 operators", "3 operadores")}</b> BlaBlaCar Bus + FlixBus + Alsa</span>
                        <span><b>{localize(locale, "Données actualisées", "Updated data", "Información actualizada")}</b> {localize(locale, "Temps réel selon l’opérateur", "Live updates by operator", "Datos en tiempo real según el operador")}</span>
                    </div>
                </div>
                <TransitSection locale={locale} className="station-board">
                    <HomeDepartures locale={locale} />
                </TransitSection>
            </section>
            <section className="value-strip" aria-label={localize(locale, "Fonctionnalités", "Features", "Funciones")}>
                <article><span>01</span><h2>{localize(locale, "Retards en direct", "Live delays", "Retrasos en directo")}</h2><p>{localize(locale, "Suivis arrêt par arrêt dès qu’une mise à jour est disponible.", "Tracked stop by stop whenever an update is available.", "Seguimiento parada a parada en cuanto hay una actualización disponible.")}</p></article>
                <article><span>02</span><h2>{localize(locale, "Infos des voyageurs", "Passenger updates", "Avisos de viajeros")}</h2><p>{localize(locale, "Une arrivée, un départ ou un changement de quai se signale en un clic.", "Report an arrival, departure or platform change in one tap.", "Avisa de una llegada, una salida o un cambio de andén con un solo toque.")}</p></article>
                <article><span>03</span><h2>{localize(locale, "Un historique utile", "Useful history", "Un historial útil")}</h2><p>{localize(locale, "Comprenez la ponctualité habituelle de votre trajet.", "See how punctual your route usually is.", "Consulta la puntualidad habitual de tu ruta.")}</p></article>
            </section>
            <section className="featured-cities">
                <div className="featured-cities-heading">
                    <div><span className="section-kicker">{localize(locale, "Sans numéro de bus", "No bus number needed", "Sin número de autobús")}</span><h2>{localize(locale, "Rechercher par ville", "Search by city", "Buscar por ciudad")}</h2></div>
                    <Link href="/villes">{localize(locale, "Voir toutes les villes", "View all cities", "Ver todas las ciudades")} <span>→</span></Link>
                </div>
                <TransitSection locale={locale}>
                    <FeaturedCities locale={locale} />
                </TransitSection>
            </section>
        </>
    );
}

async function HomeDepartures({ locale }: { locale: Locale })
{
    const journeys = await transitPageDataService.getLiveBoard(7);
    return <LiveDeparturesBoard initialJourneys={journeys} locale={locale} />;
}

async function FeaturedCities({ locale }: { locale: Locale })
{
    const cities = await transitPageDataService.getFeaturedCities(6);
    return (
        <div className="featured-city-grid">
            {cities.map((city) =>
            {
                return (
                    <Link href={`/ville/${city.slug}`} key={city.slug}>
                        <strong>{city.name}</strong>
                        <span>{countLabel(locale, city.stopCount, "gare", "gares", "station", "stations", "estación", "estaciones")}</span>
                        <small>{city.liveJourneyCount > 0
                            ? countLabel(locale, city.liveJourneyCount, "bus disponible", "bus disponibles", "bus available", "buses available", "autobús disponible", "autobuses disponibles")
                            : localize(locale, "Voir les gares", "View stations", "Ver las estaciones")}</small>
                    </Link>
                );
            })}
        </div>
    );
}
