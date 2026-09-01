import type { Metadata } from "next";
import Link from "next/link";
import { JourneyCard } from "../../components/journey-card";
import { SearchBox } from "../../components/search-box";
import { transitDataService } from "../../src/application/transit-data-service";

interface PageProps
{
    searchParams: Promise<{ q?: string | string[] }>;
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    title: "Rechercher un bus",
    robots: { index: false, follow: true }
};

export default async function SearchPage({ searchParams }: PageProps)
{
    const values = await searchParams;
    const query = typeof values.q === "string" ? values.q : "";
    const [journeys, places] = query.length >= 2
        ? await Promise.all(
        [
            transitDataService.search(query, 40),
            transitDataService.searchPlaces(query, 20)
        ])
        : [[], []];

    return (
        <div className="page-shell listing-page search-page">
            <header className="listing-heading">
                <span className="section-kicker">Recherche</span>
                <h1>Trouver <em>votre bus</em></h1>
                <SearchBox compact initialQuery={query} />
            </header>
            {places.length > 0 && (
                <section className="place-results-section">
                    <div className="section-heading-row">
                        <h2>Villes et gares</h2>
                        <span>{places.length} lieu{places.length > 1 ? "x" : ""}</span>
                    </div>
                    <div className="place-card-grid">
                        {places.map((place) =>
                        {
                            return (
                                <Link className="place-card" href={place.href} key={`${place.type}-${place.id}`}>
                                    <span>{place.type === "city" ? "Ville" : "Gare"}</span>
                                    <strong>{place.label}</strong>
                                    <small>{place.detail}</small>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <h2>{journeys.length} résultat{journeys.length > 1 ? "s" : ""}</h2>
                </div>
                {journeys.length === 0 ? (
                    <div className="empty-state"><h2>Aucun bus trouvé aujourd’hui</h2><p>Essayez un numéro, une ville ou un trajet comme Paris → Tours.</p></div>
                ) : (
                    <div className="journey-list">{journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} />)}</div>
                )}
            </section>
        </div>
    );
}
