import type { Metadata } from "next";
import Link from "next/link";
import { TransitSection } from "../../components/transit-section";
import { StructuredData } from "../../components/structured-data";
import { countLabel, localize, type Locale } from "../../src/application/i18n";
import { requestLocale } from "../request-locale";
import { absoluteUrl, breadcrumbStructuredData } from "../../src/application/seo";
import { transitPageDataService } from "../../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata>
{
    const locale = await requestLocale();
    return {
        title: localize(locale, "Bus en temps réel par ville et gare routière", "Live buses by city and coach station", "Autobuses en tiempo real por ciudad y estación"),
        description: localize(
            locale,
            "Retrouvez les gares routières BlaBlaCar Bus, FlixBus et Alsa, les prochains passages et les retards disponibles en temps réel.",
            "Find BlaBlaCar Bus, FlixBus and Alsa coach stations, upcoming services and available live delay information.",
            "Encuentra las estaciones de BlaBlaCar Bus, FlixBus y Alsa, las próximas salidas y los retrasos disponibles en tiempo real."
        ),
        alternates: {
            canonical: "/villes"
        }
    };
}

export default async function CitiesPage()
{
    const locale = await requestLocale();

    return (
        <div className="page-shell directory-page">
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb", "Migas de pan")}>
                <Link href="/">{localize(locale, "Accueil", "Home", "Inicio")}</Link><span>›</span><span>{localize(locale, "Villes et gares", "Cities and stations", "Ciudades y estaciones")}</span>
            </nav>
            <header className="listing-heading">
                <span className="section-kicker">{localize(locale, "Explorer le réseau", "Explore the network", "Explora la red")}</span>
                <h1>{localize(locale, "Toutes les", "All", "Todas las")} <em>{localize(locale, "villes", "cities", "ciudades")}</em></h1>
                <p>{localize(locale, "Choisissez une ville pour retrouver ses gares et les prochains bus.", "Choose a city to find its stations and upcoming buses.", "Elige una ciudad para ver sus estaciones y los próximos autobuses.")}</p>
            </header>
            <TransitSection locale={locale}>
                <CityDirectory locale={locale} />
            </TransitSection>
        </div>
    );
}

async function CityDirectory({ locale }: { locale: Locale })
{
    const cities = await transitPageDataService.getCityDirectory();
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: localize(locale, "Accueil", "Home", "Inicio"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations", "Ciudades y estaciones"), path: "/villes" }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: localize(locale, "Villes et gares routières suivies par BusMinute", "Cities and coach stations tracked by BusMinute", "Ciudades y estaciones de autobuses disponibles en BusMinute"),
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
        <>
            <section className="city-directory" aria-label={localize(locale, "Villes desservies", "Served cities", "Ciudades con servicio")}>
                {cities.map((city) =>
                {
                    return (
                        <Link className="city-directory-card" href={`/ville/${city.slug}`} key={city.slug}>
                            <strong>{city.name}</strong>
                            <span>{countLabel(locale, city.stopCount, "gare", "gares", "station", "stations", "estación", "estaciones")}</span>
                            {city.liveJourneyCount > 0 && <small>{countLabel(locale, city.liveJourneyCount, "bus à venir", "bus à venir", "upcoming bus", "upcoming buses", "autobús próximo", "autobuses próximos")}</small>}
                        </Link>
                    );
                })}
            </section>
            <StructuredData value={structuredData} />
        </>
    );
}
