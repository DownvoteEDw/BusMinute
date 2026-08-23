import Link from "next/link";
import { SearchBox } from "../components/search-box";
import { transitDataService } from "../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export default async function HomePage()
{
    const cities = await transitDataService.getFeaturedCities(6);

    return (
        <>
            <section className="hero">
                <div className="hero-copy">
                    <span className="eyebrow">Le direct des cars longue distance</span>
                    <h1>Votre bus.<br /><em>Minute par minute.</em></h1>
                    <p>Horaires réels, retard à chaque arrêt et informations partagées par les voyageurs.</p>
                    <SearchBox />
                    <div className="trust-row">
                        <span><b>Officiel</b> Horaires GTFS</span>
                        <span><b>Temps réel</b> Actualisé chaque minute</span>
                    </div>
                </div>
                <div className="live-card" aria-label="Exemple de suivi en direct">
                    <div className="live-card-top">
                        <span className="live-pill"><i /> Exemple réel</span>
                        <span>Bus 50819</span>
                    </div>
                    <h2>Paris <span>→</span> Tours</h2>
                    <div className="delay-display">
                        <strong>+5</strong>
                        <span>minutes<br />au départ</span>
                    </div>
                    <ol className="mini-timeline">
                        <li className="done"><span>Paris Bercy</span><b>09:55</b></li>
                        <li className="done"><span>Orléans</span><b>11:40</b></li>
                        <li><span>Tours</span><b>12:50</b></li>
                    </ol>
                    <Link href="/suivi/50819%3A2026-08-22">Ouvrir le suivi complet <span>↗</span></Link>
                </div>
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
