import type { Metadata } from "next";
import Link from "next/link";
import { StructuredData } from "../../components/structured-data";
import { countLabel, localize } from "../../src/application/i18n";
import { requestLocale } from "../request-locale";
import { absoluteUrl, breadcrumbStructuredData } from "../../src/application/seo";
import { transitDataService } from "../../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata>
{
    const locale = await requestLocale();
    return {
        title: localize(locale, "Bus en temps réel par ville et gare routière", "Live buses by city and coach station"),
        description: localize(
            locale,
            "Retrouvez les gares routières BlaBlaCar Bus et FlixBus, les prochains passages et les retards BlaBlaCar Bus en temps réel.",
            "Find BlaBlaCar Bus and FlixBus coach stations, upcoming services and live delay information."
        ),
        alternates: {
            canonical: "/villes"
        }
    };
}

export default async function CitiesPage()
{
    const locale = await requestLocale();
    const cities = await transitDataService.getCityDirectory();
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: localize(locale, "Accueil", "Home"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations"), path: "/villes" }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: localize(locale, "Villes et gares routières suivies par BusMinute", "Cities and coach stations tracked by BusMinute"),
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
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb")}>
                <Link href="/">{localize(locale, "Accueil", "Home")}</Link><span>›</span><span>{localize(locale, "Villes et gares", "Cities and stations")}</span>
            </nav>
            <header className="listing-heading">
                <span className="section-kicker">{localize(locale, "Explorer le réseau", "Explore the network")}</span>
                <h1>{localize(locale, "Toutes les", "All")} <em>{localize(locale, "villes", "cities")}</em></h1>
                <p>{localize(locale, "Choisissez une ville pour retrouver ses gares et les prochains bus.", "Choose a city to find its stations and upcoming buses.")}</p>
            </header>
            <section className="city-directory" aria-label={localize(locale, "Villes desservies", "Served cities")}>
                {cities.map((city) =>
                {
                    return (
                        <Link className="city-directory-card" href={`/ville/${city.slug}`} key={city.slug}>
                            <strong>{city.name}</strong>
                            <span>{countLabel(locale, city.stopCount, "gare", "gares", "station", "stations")}</span>
                            {city.liveJourneyCount > 0 && <small>{countLabel(locale, city.liveJourneyCount, "bus à venir", "bus à venir", "upcoming bus", "upcoming buses")}</small>}
                        </Link>
                    );
                })}
            </section>
            <StructuredData value={structuredData} />
        </div>
    );
}
