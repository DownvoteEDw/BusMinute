import Link from "next/link";
import { LiveDeparturesBoard } from "../components/live-departures-board";
import { SearchBox } from "../components/search-box";
import { transitDataService } from "../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export default async function HomePage()
{
    const [cities, journeys] = await Promise.all(
    [
        transitDataService.getFeaturedCities(6),
        transitDataService.getLiveBoard(7)
    ]);

    return (
        <>
            <section className="hero">
                <div className="hero-copy">
                    <span className="eyebrow">Le panneau des cars longue distance</span>
                    <h1>Votre bus.<br /><em>En temps réel.</em></h1>
                    <p>Trouvez un trajet ou un numéro de bus et consultez les prochains passages comme sur le panneau de votre gare.</p>
                    <SearchBox />
                    <div className="trust-row">
                        <span><b>Officiel</b> Horaires GTFS</span>
                        <span><b>Temps réel</b> Actualisé automatiquement</span>
                    </div>
                </div>
                <LiveDeparturesBoard initialJourneys={journeys} />
            </section>
            <section className="value-strip" aria-label="Fonctionnalités">
                <article><span>01</span><h2>Le vrai retard</h2><p>Calculé arrêt par arrêt, pas seulement au départ.</p></article>
                <article><span>02</span><h2>La voix des passagers</h2><p>Signalez une arrivée, un départ ou un quai modifié.</p></article>
                <article><span>03</span><h2>Un historique utile</h2><p>Comprenez la ponctualité habituelle de votre trajet.</p></article>
            </section>
            <section className="featured-cities">
                <div className="featured-cities-heading">
                    <div><span className="section-kicker">Sans numéro de bus</span><h2>Rechercher par ville</h2></div>
                    <Link href="/villes">Voir toutes les villes <span>→</span></Link>
                </div>
                <div className="featured-city-grid">
                    {cities.map((city) =>
                    {
                        return (
                            <Link href={`/ville/${city.slug}`} key={city.slug}>
                                <strong>{city.name}</strong>
                                <span>{city.stopCount} gare{city.stopCount > 1 ? "s" : ""}</span>
                                <small>{city.liveJourneyCount > 0 ? `${city.liveJourneyCount} bus disponibles` : "Voir les gares"}</small>
                            </Link>
                        );
                    })}
                </div>
            </section>
        </>
    );
}
