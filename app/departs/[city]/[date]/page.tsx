import type { Metadata } from "next";
import Link from "next/link";
import { journeyPath } from "../../../../src/application/journey-url";
import { notFound } from "next/navigation";
import { JourneyCard } from "../../../../components/journey-card";
import { StructuredData } from "../../../../components/structured-data";
import { localeTag, localize, type Locale } from "../../../../src/application/i18n";
import { requestLocale } from "../../../request-locale";
import { absoluteUrl, breadcrumbStructuredData } from "../../../../src/application/seo";
import { transitDataService } from "../../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ city: string; date: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const locale = await requestLocale();
    const { city, date } = await params;

    if (!isValidDate(date))
    {
        return { title: localize(locale, "Date invalide", "Invalid date"), robots: { index: false, follow: true } };
    }

    const board = await transitDataService.getDepartureBoard(city, date);

    if (!board)
    {
        return { title: localize(locale, "Ville introuvable", "City not found") };
    }

    return {
        title: localize(
            locale,
            `Départs de bus à ${board.name} le ${shortDate(date, locale)} en temps réel`,
            `Live bus departures in ${board.name} on ${shortDate(date, locale)}`
        ),
        description: localize(
            locale,
            `Consultez les départs de bus à ${board.name} le ${longDate(date, locale)}, les horaires BlaBlaCar Bus et FlixBus et les retards en temps réel disponibles.`,
            `Check BlaBlaCar Bus and FlixBus departures in ${board.name} on ${longDate(date, locale)}, including live delays when available.`
        ),
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
    const locale = await requestLocale();
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
            { name: localize(locale, "Accueil", "Home"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations"), path: "/villes" },
            { name: board.name, path: `/ville/${board.slug}` },
            { name: longDate(date, locale), path: `/departs/${board.slug}/${date}` }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: localize(locale, `Départs de bus à ${board.name} le ${longDate(date, locale)}`, `Bus departures in ${board.name} on ${longDate(date, locale)}`),
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
                        name: localize(locale, `Bus ${journey.serviceNumber} ${journey.originCity} vers ${journey.destinationCity}`, `Bus ${journey.serviceNumber} ${journey.originCity} to ${journey.destinationCity}`),
                        url: absoluteUrl(journeyPath(journey.journeyRef))
                    };
                })
            }
        }
    ];

    return (
        <div className="page-shell departures-page">
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb")}>
                <Link href="/">{localize(locale, "Accueil", "Home")}</Link><span>›</span><Link href="/villes">{localize(locale, "Villes", "Cities")}</Link><span>›</span><Link href={`/ville/${board.slug}`}>{board.name}</Link><span>›</span><span>{shortDate(date, locale)}</span>
            </nav>
            <header className="listing-heading">
                <span className="section-kicker">{localize(locale, "Tableau des départs", "Departure board")}</span>
                <h1>{board.name}, <em>{shortDate(date, locale)}</em></h1>
                <p>{localize(locale, "Départs et passages connus dans toutes les gares routières de la ville.", "Known departures and services across all coach stations in the city.")}</p>
            </header>
            <section className="journey-list-section">
                <div className="section-heading-row">
                    <div><span className="live-pill light"><i /> {localize(locale, "Temps réel", "Live")}</span><h2>{localize(locale, "Bus disponibles", "Available buses")}</h2></div>
                    <span>{board.journeys.length} bus</span>
                </div>
                {board.journeys.length === 0 ? (
                    <div className="empty-state"><h2>{localize(locale, "Aucun départ disponible pour cette date", "No departures available on this date")}</h2><p>{localize(locale, `Consultez la page de ${board.name} pour voir les autres horaires.`, `Check the ${board.name} page for other times.`)}</p></div>
                ) : (
                    <div className="journey-list">{board.journeys.map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} locale={locale} />)}</div>
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

function shortDate(value: string, locale: Locale): string
{
    return new Intl.DateTimeFormat(localeTag(locale),
    {
        day: "numeric",
        month: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}

function longDate(value: string, locale: Locale): string
{
    return new Intl.DateTimeFormat(localeTag(locale),
    {
        dateStyle: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}
