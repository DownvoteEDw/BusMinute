import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyCard } from "../../../../components/journey-card";
import { StructuredData } from "../../../../components/structured-data";
import { absoluteUrl, breadcrumbStructuredData } from "../../../../src/application/seo";
import { transitDataService } from "../../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ city: string; date: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const { city, date } = await params;

    if (!isValidDate(date))
    {
        return { title: "Date invalide", robots: { index: false, follow: true } };
    }

    const board = await transitDataService.getDepartureBoard(city, date);

    if (!board)
    {
        return { title: "Ville introuvable" };
    }

    return {
        title: `Départs de bus à ${board.name} le ${shortDate(date)}`,
        description: `Consultez les départs de bus à ${board.name} le ${longDate(date)}, avec les horaires prévus et les retards disponibles.`,
        alternates: {
            canonical: `/departs/${board.slug}/${date}`
        },
        robots: {
            index: board.journeys.length > 0,
            follow: true
        }
    };
}

export default async function DeparturesPage({ params }: PageProps)
{
    const { city, date } = await params;

    if (!isValidDate(date))
    {
        notFound();
    }

    const board = await transitDataService.getDepartureBoard(city, date);

    if (!board)
    {
        notFound();
    }

    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: "Accueil", path: "/" },
            { name: "Villes et gares", path: "/villes" },
            { name: board.name, path: `/ville/${board.slug}` },
            { name: longDate(date), path: `/departs/${board.slug}/${date}` }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: `Départs de bus à ${board.name} le ${longDate(date)}`,
            url: absoluteUrl(`/departs/${board.slug}/${date}`),
            datePublished: date,
            mainEntity: {
                "@type": "ItemList",
                numberOfItems: board.journeys.length,
                itemListElement: board.journeys.map((journey, index) =>
                {
                    return {
                        "@type": "ListItem",
                        position: index + 1,
                        name: `Bus ${journey.serviceNumber} ${journey.originCity} vers ${journey.destinationCity}`,
                        url: absoluteUrl(`/suivi/${encodeURIComponent(journey.journeyRef)}`)
                    };
                })
            }
        }
    ];

    return (
        <div className="page-shell departures-page">
            <nav className="breadcrumbs" aria-label="Fil d’Ariane">
                <Link href="/">Accueil</Link><span>›</span><Link href="/villes">Villes</Link><span>›</span><Link href={`/ville/${board.slug}`}>{board.name}</Link><span>›</span><span>{shortDate(date)}</span>
            </nav>
            <header className="listing-heading">
                <span className="section-kicker">Tableau des départs</span>
                <h1>{board.name}, <em>{shortDate(date)}</em></h1>
                <p>Départs et passages connus dans toutes les gares routières de la ville.</p>
            </header>
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> Direct</span><h2>Circulations disponibles</h2></div>
                    <span>{board.journeys.length} bus</span>
                </div>
                {board.journeys.length === 0 ? (
                    <div className="empty-state"><h2>Aucun départ disponible pour cette date</h2><p>Consultez la page de {board.name} pour voir les autres circulations.</p></div>
                ) : (
                    <div className="journey-list">{board.journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} />)}</div>
                )}
            </section>
            <StructuredData value={structuredData} />
        </div>
    );
}

function isValidDate(value: string): boolean
{
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
}

function shortDate(value: string): string
{
    return new Intl.DateTimeFormat("fr-FR",
    {
        day: "numeric",
        month: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}

function longDate(value: string): string
{
    return new Intl.DateTimeFormat("fr-FR",
    {
        dateStyle: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}
