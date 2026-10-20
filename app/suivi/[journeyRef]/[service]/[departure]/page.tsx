import { transitMetadata } from "../../../../transit-metadata";
import { TransitPage } from "../../../../../components/transit-page";
import { cache } from "react";
import { ShareJourney } from "../../../../../components/share-journey";
import { journeyDateLabel } from "../../../../../src/application/journey-date";
import type { Metadata } from "next";
import Link from "next/link";
import { journeyPath, busServicePath, cityRoutePath, publicJourneyId } from "../../../../../src/application/journey-url";
import { notFound, permanentRedirect } from "next/navigation";
import { JourneyTracker } from "../../../../../components/journey-tracker";
import { OperatorLogo } from "../../../../../components/operator-logo";
import { StructuredData } from "../../../../../components/structured-data";
import { localeTag, localize, type Locale } from "../../../../../src/application/i18n";
import { citySlug, type JourneyView } from "../../../../../src/application/journey-view";
import { requestLocale } from "../../../../request-locale";
import { absoluteUrl, breadcrumbStructuredData, isJourneyCompleted } from "../../../../../src/application/seo";
import { transitPageDataService } from "../../../../../src/application/transit-data-service";

interface PageProps
{
    params: Promise<{ journeyRef: string; service: string; departure: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps): Promise<Metadata>
{
    const { journeyRef, service, departure } = await props.params;
    return transitMetadata(() => loadMetadata(props), `/suivi/${encodeURIComponent(journeyRef)}/${encodeURIComponent(service)}/${encodeURIComponent(departure)}`);
}

async function loadMetadata({ params }: PageProps): Promise<Metadata>
{
    const locale = await requestLocale();
    const journey = await resolveJourney(await params);

    if (!journey)
    {
        return { title: localize(locale, "Bus introuvable", "Bus not found", "Autobús no encontrado") };
    }

    const date = longDate(journey.serviceDate, locale);
    const archived = isJourneyCompleted(journey);
    const title = `${journey.operatorName} ${journey.serviceNumber} ${journey.originCity} → ${journey.destinationCity} — ${date}`;
    const description = archived
        ? localize(
            locale,
            `Retrouvez les horaires enregistrés du bus ${journey.serviceNumber}, de ${journey.originCity} à ${journey.destinationCity}, pour la circulation du ${date}.`,
            `View the recorded schedule for bus ${journey.serviceNumber} from ${journey.originCity} to ${journey.destinationCity} on ${date}.`,
            `Consulta los horarios registrados del autobús ${journey.serviceNumber}, de ${journey.originCity} a ${journey.destinationCity}, para el servicio del ${date}.`
        )
        : journey.realtimeObserved
        ? localize(
            locale,
            `Suivez le bus ${journey.serviceNumber} du ${date} en direct : horaires réels, retard à chaque arrêt et signalements voyageurs.`,
            `Track bus ${journey.serviceNumber} on ${date} live, with real times, delay at every stop and passenger reports.`,
            `Sigue en directo el autobús ${journey.serviceNumber} del ${date}, con horarios reales, retrasos en cada parada y avisos de viajeros.`
        )
        : localize(
            locale,
            `Consultez les horaires prévus du bus ${journey.serviceNumber}, de ${journey.originCity} à ${journey.destinationCity}, le ${date}.`,
            `Check the scheduled times for bus ${journey.serviceNumber} from ${journey.originCity} to ${journey.destinationCity} on ${date}.`,
            `Consulta los horarios previstos del autobús ${journey.serviceNumber}, de ${journey.originCity} a ${journey.destinationCity}, el ${date}.`
        );

    return {
        title,
        description,
        alternates: {
            canonical: journeyPath(journey)
        },
        // Une circulation datée ne vit que quelques jours : la page permanente /bus/ porte le référencement.
        robots: {
            index: false,
            follow: true
        },
        openGraph: {
            title,
            description,
            url: absoluteUrl(journeyPath(journey)),
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
    const journey = await resolveJourney(await params);
    if (!journey)
    {
        notFound();
    }
    return (
        <TransitPage key={JSON.stringify(await params)} locale={locale} title={localize(locale, "Suivre votre bus", "Track your bus", "Sigue tu autobús")}>
            <JourneyPageContent journey={journey} locale={locale} />
        </TransitPage>
    );
}

function JourneyPageContent({ journey, locale }: { journey: JourneyView; locale: Locale })
{
    const originCitySlug = citySlug(journey.originCity);
    const archived = isJourneyCompleted(journey);
    const journeyDate = longDate(journey.serviceDate, locale);
    const structuredData = [
        breadcrumbStructuredData(
        [
            { name: localize(locale, "Accueil", "Home", "Inicio"), path: "/" },
            { name: localize(locale, "Villes et gares", "Cities and stations", "Ciudades y estaciones"), path: "/villes" },
            { name: `Bus ${journey.serviceNumber}`, path: busServicePath(journey) },
            { name: `Bus ${journey.serviceNumber}`, path: journeyPath(journey) }
        ]),
        {
            "@context": "https://schema.org",
            "@type": "BusTrip",
            name: localize(locale, `Bus ${journey.serviceNumber} ${journey.originCity} vers ${journey.destinationCity}`, `Bus ${journey.serviceNumber} ${journey.originCity} to ${journey.destinationCity}`, `Autobús ${journey.serviceNumber} de ${journey.originCity} a ${journey.destinationCity}`),
            url: absoluteUrl(journeyPath(journey)),
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
            <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb", "Migas de pan")}>
                <Link href="/">{localize(locale, "Accueil", "Home", "Inicio")}</Link><span>›</span><Link href="/villes">{localize(locale, "Villes", "Cities", "Ciudades")}</Link><span>›</span><Link href={`/ville/${originCitySlug}`}>{journey.originCity}</Link><span>›</span><span>Bus {journey.serviceNumber}</span>
            </nav>
            <header className="route-heading">
                <span className="section-kicker">{archived ? localize(locale, "Horaires enregistrés", "Recorded schedule", "Horarios registrados") : localize(locale, "Horaires et suivi du trajet", "Journey times and tracking", "Horarios y seguimiento del trayecto")}</span>
                <h1>{journey.originCity} <span>→</span> {journey.destinationCity}</h1>
                <div className="route-heading-footer">
                    <div className="route-identity">
                        <OperatorLogo className="route-operator-logo" operatorSlug={journey.operatorSlug} />
                        <p>Bus <strong>{journey.serviceNumber}</strong> · <strong>{journeyDateLabel(journey, locale)}</strong><br /><time dateTime={journey.serviceDate}>{journeyDate}</time></p>
                    </div>
                    <div className="route-links">
                        <Link href={busServicePath(journey)}>{localize(locale, `Tous les départs du bus ${journey.serviceNumber}`, `All bus ${journey.serviceNumber} departures`, `Todas las salidas del autobús ${journey.serviceNumber}`)}</Link>
                        <Link href={cityRoutePath(citySlug(journey.originCity), citySlug(journey.destinationCity))}>{localize(locale, `Tous les bus ${journey.originCity} → ${journey.destinationCity}`, `All buses ${journey.originCity} → ${journey.destinationCity}`, `Todos los autobuses ${journey.originCity} → ${journey.destinationCity}`)}</Link>
                        <ShareJourney path={journeyPath(journey)} title={titleForShare(journey.serviceNumber, journey.serviceDate)} locale={locale} />
                    </div>
                </div>
            </header>
            {archived && (
                <aside className="journey-archive-notice">
                    <div>
                        <strong>{localize(locale, "Cette circulation est terminée", "This journey has ended", "Este servicio ha finalizado")}</strong>
                        <span>{localize(locale, `Elle a eu lieu le ${journeyDate}. Les informations affichées correspondent à ce trajet passé.`, `It ran on ${journeyDate}. The information shown belongs to this past journey.`, `Tuvo lugar el ${journeyDate}. La información mostrada corresponde a ese trayecto.`)}</span>
                    </div>
                    <Link href={busServicePath(journey)}>
                        {localize(locale, `Voir les bus ${journey.serviceNumber} à venir`, `View bus ${journey.serviceNumber} upcoming departures`, `Ver los servicios ${journey.serviceNumber} próximos`)}
                    </Link>
                </aside>
            )}
            <JourneyTracker initialJourney={journey} initialNow={Date.now()} locale={locale} completed={archived} mapStyleUrl={process.env.MAP_STYLE_URL || undefined} />
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

const loadJourney = cache((id: string) => transitPageDataService.getPublicJourney(id));

async function resolveJourney(params: { journeyRef: string; service: string; departure: string })
{
    const id = publicJourneyId(params.departure);
    const journey = id ? await loadJourney(id) : null;
    if (journey)
    {
        const path = `/suivi/${encodeURIComponent(params.journeyRef)}/${encodeURIComponent(params.service)}/${params.departure}`;
        if (path !== journeyPath(journey))
        {
            permanentRedirect(journeyPath(journey));
        }
    }
    return journey;
}

function titleForShare(service: string, date: string): string
{
    return `Bus ${service} · ${date}`;
}
