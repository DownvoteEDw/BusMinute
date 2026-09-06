import type { Metadata } from "next";
import Link from "next/link";
import { journeyPath, journeyRefFromPath } from "../../../src/application/journey-url";
import { notFound } from "next/navigation";
import { JourneyTracker } from "../../../components/journey-tracker";
import { StructuredData } from "../../../components/structured-data";
import { localeTag, localize, type Locale } from "../../../src/application/i18n";
import { citySlug } from "../../../src/application/journey-view";
import { requestLocale } from "../../request-locale";
import { absoluteUrl, breadcrumbStructuredData, isJourneyOutsideIndexingWindow } from "../../../src/application/seo";
import { transitDataService } from "../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ journeyRef: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata>
{
    const locale = await requestLocale();
    const { journeyRef: rawJourneyRef } = await params;
    const journeyRef = journeyRefFromPath(rawJourneyRef);
    const journey = journeyRef ? await transitDataService.getJourney(journeyRef) : null;

    if (!journey)
    {
        return { title: localize(locale, "Bus introuvable", "Bus not found") };
    }

    const date = longDate(journey.serviceDate, locale);
    const archived = isJourneyOutsideIndexingWindow(journey);
    const title = `${journey.operatorName} ${journey.serviceNumber} ${journey.originCity} → ${journey.destinationCity} — ${date}`;
    const description = archived
        ? localize(
            locale,
            `Retrouvez les horaires enregistrés du bus ${journey.serviceNumber}, de ${journey.originCity} à ${journey.destinationCity}, pour la circulation du ${date}.`,
            `View the recorded schedule for bus ${journey.serviceNumber} from ${journey.originCity} to ${journey.destinationCity} on ${date}.`
        )
        : journey.realtimeAvailable
        ? localize(
            locale,
            `Suivez le bus ${journey.serviceNumber} du ${date} en direct : horaires réels, retard à chaque arrêt et signalements voyageurs.`,
            `Track bus ${journey.serviceNumber} on ${date} live, with real times, delay at every stop and passenger reports.`
        )
        : localize(
            locale,
            `Consultez les horaires prévus du bus ${journey.serviceNumber}, de ${journey.originCity} à ${journey.destinationCity}, le ${date}.`,
            `Check the scheduled times for bus ${journey.serviceNumber} from ${journey.originCity} to ${journey.destinationCity} on ${date}.`
        );

    return {
        title,
        description,
        alternates: {
            canonical: journeyPath(journey.journeyRef)
        },
        robots: {
            index: !archived,
            follow: true
        },
        openGraph: {
            title,
            description,
            type: "website",
            images: []
        },
        twitter: {
            card: "summary",
            title,
            description,
            images: []
        }
    };
}

export default async function JourneyPage({ params }: PageProps)
{
    const locale = await requestLocale();
    const { journeyRef: rawJourneyRef } = await params;
    const journeyRef = journeyRefFromPath(rawJourneyRef);
    const journey = journeyRef ? await transitDataService.getJourney(journeyRef) : null;

    if (!journey)
    {
        notFound();
    }

    const originCitySlug = citySlug(journey.originCity);
    const archived = isJourneyOutsideIndexingWindow(journey);
    const journeyDate = longDate(journey.serviceDate, locale);
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: localize(locale, "Accueil", "Home"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations"), path: "/villes" },
            { name: journey.originCity, path: `/ville/${originCitySlug}` },
            { name: `Bus ${journey.serviceNumber}`, path: journeyPath(journey.journeyRef) }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "BusTrip",
            name: localize(locale, `Bus ${journey.serviceNumber} ${journey.originCity} vers ${journey.destinationCity}`, `Bus ${journey.serviceNumber} ${journey.originCity} to ${journey.destinationCity}`),
            url: absoluteUrl(journeyPath(journey.journeyRef)),
            busNumber: journey.serviceNumber,
            departureBusStop: {
                "@type": "BusStation",
                name: journey.originName,
                url: absoluteUrl(`/gares/${encodeURIComponent(journey.originStopId)}`)
            },
            arrivalBusStop: {
                "@type": "BusStation",
                name: journey.destinationName,
                url: absoluteUrl(`/gares/${encodeURIComponent(journey.destinationStopId)}`)
            },
            departureTime: journey.stops[0]?.aimedDepartureAt,
            arrivalTime: journey.stops[journey.stops.length - 1]?.aimedArrivalAt
        }
    ];

    return (
        <div className="page-shell tracker-page">
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb")}>
                <Link href="/">{localize(locale, "Accueil", "Home")}</Link><span>›</span><Link href="/villes">{localize(locale, "Villes", "Cities")}</Link><span>›</span><Link href={`/ville/${originCitySlug}`}>{journey.originCity}</Link><span>›</span><span>Bus {journey.serviceNumber}</span>
            </nav>
            <header className="route-heading">
                <div>
                    <span className="section-kicker">{journey.realtimeAvailable ? localize(locale, "Suivi en temps réel + voyageurs", "Live tracking + passenger updates") : localize(locale, "Horaire prévu", "Scheduled time")}</span>
                    <h1>{journey.originCity} <span>→</span> {journey.destinationCity}</h1>
                    <p>{journey.operatorName} · Bus <strong>{journey.serviceNumber}</strong> · {journeyDate}</p>
                </div>
                <div className="route-links">
                    <Link href={`/gares/${encodeURIComponent(journey.originStopId)}`}>{journey.originCity}</Link>
                    <Link href={`/trajets/${encodeURIComponent(journey.originStopId)}/${encodeURIComponent(journey.destinationStopId)}`}>{localize(locale, "Voir cette liaison", "View this route")}</Link>
                </div>
            </header>
            {archived && (
                <aside className="journey-archive-notice">
                    <div>
                        <strong>{localize(locale, "Cette circulation est terminée", "This journey has ended")}</strong>
                        <span>{localize(locale, `Elle a eu lieu le ${journeyDate}. Les informations affichées correspondent à ce trajet passé.`, `It ran on ${journeyDate}. The information shown belongs to this past journey.`)}</span>
                    </div>
                    <Link href={`/recherche?q=${encodeURIComponent(journey.serviceNumber)}`}>
                        {localize(locale, `Voir les bus ${journey.serviceNumber} disponibles aujourd’hui`, `View bus ${journey.serviceNumber} services available today`)}
                    </Link>
                </aside>
            )}
            <JourneyTracker initialJourney={journey} locale={locale} />
            <StructuredData value={structuredData} />
        </div>
    );
}

function longDate(value: string, locale: Locale): string
{
    return new Intl.DateTimeFormat(localeTag(locale),
    {
        dateStyle: "long",
        timeZone: "Europe/Paris"
    }).format(new Date(`${value}T12:00:00Z`));
}
