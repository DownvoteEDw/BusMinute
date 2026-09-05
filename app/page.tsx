import Link from "next/link";
import { LiveDeparturesBoard } from "../components/live-departures-board";
import { SearchBox } from "../components/search-box";
import { countLabel, localize } from "../src/application/i18n";
import { requestLocale } from "./request-locale";
import { transitDataService } from "../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export default async function HomePage()
{
    const locale = await requestLocale();
    const [cities, journeys] = await Promise.all(
    [
        transitDataService.getFeaturedCities(6),
        transitDataService.getLiveBoard(7)
    ]);

    return (
        <>
            <section className="hero">
                <div className="hero-copy">
                    <span className="eyebrow">{localize(locale, "Vos départs, minute par minute", "Departures, minute by minute")}</span>
                    <h1>{localize(locale, "Votre bus.", "Your bus.")}<br /><em>{localize(locale, "En temps réel.", "Live.")}</em></h1>
                    <p>{localize(
                        locale,
                        "Trouvez un trajet ou un numéro de bus et consultez les prochains passages comme sur le panneau de votre gare.",
                        "Find a route or bus number and check upcoming services just like on the departure board at your station."
                    )}</p>
                    <SearchBox locale={locale} />
                    <div className="trust-row">
                        <span><b>{localize(locale, "2 opérateurs", "2 operators")}</b> BlaBlaCar Bus + FlixBus</span>
                        <span><b>{localize(locale, "Temps réel", "Live data")}</b> {localize(locale, "Actualisé automatiquement", "Updated automatically")}</span>
                    </div>
                </div>
                <LiveDeparturesBoard initialJourneys={journeys} locale={locale} />
            </section>
            <section className="value-strip" aria-label={localize(locale, "Fonctionnalités", "Features")}>
                <article><span>01</span><h2>{localize(locale, "Retards en direct", "Live delays")}</h2><p>{localize(locale, "Suivis arrêt par arrêt dès qu’une mise à jour est disponible.", "Tracked stop by stop whenever an update is available.")}</p></article>
                <article><span>02</span><h2>{localize(locale, "Infos des voyageurs", "Passenger updates")}</h2><p>{localize(locale, "Une arrivée, un départ ou un changement de quai se signale en un clic.", "Report an arrival, departure or platform change in one tap.")}</p></article>
                <article><span>03</span><h2>{localize(locale, "Un historique utile", "Useful history")}</h2><p>{localize(locale, "Comprenez la ponctualité habituelle de votre trajet.", "See how punctual your route usually is.")}</p></article>
            </section>
            <section className="featured-cities">
                <div className="featured-cities-heading">
                    <div><span className="section-kicker">{localize(locale, "Sans numéro de bus", "No bus number needed")}</span><h2>{localize(locale, "Rechercher par ville", "Search by city")}</h2></div>
                    <Link href="/villes">{localize(locale, "Voir toutes les villes", "View all cities")} <span>→</span></Link>
                </div>
                <div className="featured-city-grid">
                    {cities.map((city) =>
                    {
                        return (
                            <Link href={`/ville/${city.slug}`} key={city.slug}>
                                <strong>{city.name}</strong>
                                <span>{countLabel(locale, city.stopCount, "gare", "gares", "station", "stations")}</span>
                                <small>{city.liveJourneyCount > 0
                                    ? countLabel(locale, city.liveJourneyCount, "bus disponible", "bus disponibles", "bus available", "buses available")
                                    : localize(locale, "Voir les gares", "View stations")}</small>
                            </Link>
                        );
                    })}
                </div>
            </section>
        </>
    );
}
