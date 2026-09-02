import type { Metadata } from "next";
import Link from "next/link";
import { StructuredData } from "../../components/structured-data";
import { absoluteUrl, breadcrumbStructuredData } from "../../src/application/seo";
import { transitDataService } from "../../src/application/transit-data-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    title: "Bus en temps réel par ville et gare routière",
    description: "Retrouvez les gares routières BlaBlaCar Bus et FlixBus, les prochains passages et les retards BlaBlaCar Bus en temps réel.",
    alternates: {
        canonical: "/villes"
    }
};

export default async function CitiesPage()
{
    const cities = await transitDataService.getCityDirectory();
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: "Accueil", path: "/" },
            { name: "Villes et gares", path: "/villes" }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Villes et gares routières suivies par BusMinute",
            url: absoluteUrl("/villes"),
            mainEntity: {
                "@type": "ItemList",
                numberOfItems: cities.length,
                itemListElement: cities.map((city, index) =>
                {
                    return {
                        "@type": "ListItem",
                        position: index + 1,
                        name: city.name,
                        url: absoluteUrl(`/ville/${city.slug}`)
                    };
                })
            }
        }
    ];

    return (
        <div className="page-shell directory-page">
            <nav className="breadcrumbs" aria-label="Fil d’Ariane">
                <Link href="/">Accueil</Link><span>›</span><span>Villes et gares</span>
            </nav>
            <header className="listing-heading">
                <span className="section-kicker">Explorer le réseau</span>
                <h1>Toutes les <em>villes</em></h1>
                <p>Choisissez une ville pour retrouver ses gares et les prochains bus.</p>
            </header>
            <section className="city-directory" aria-label="Villes desservies">
                {cities.map((city) =>
                {
                    return (
                        <Link className="city-directory-card" href={`/ville/${city.slug}`} key={city.slug}>
                            <strong>{city.name}</strong>
                            <span>{city.stopCount} gare{city.stopCount > 1 ? "s" : ""}</span>
                            {city.liveJourneyCount > 0 && <small>{city.liveJourneyCount} bus à venir</small>}
                        </Link>
                    );
                })}
            </section>
            <StructuredData value={structuredData} />
        </div>
    );
}
