import { transitMetadata } from "../../../transit-metadata";
import { JourneyUpdates } from "../../../../components/journey-updates";
import { TransitPage } from "../../../../components/transit-page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { JourneyCard } from "../../../../components/journey-card";
import { OperatorLogo } from "../../../../components/operator-logo";
import { StructuredData } from "../../../../components/structured-data";
import { busServicePath, cityRoutePath, journeyPath, journeyRefFromPath } from "../../../../src/application/journey-url";
import { citySlug } from "../../../../src/application/journey-view";
import { journeyDateLabel } from "../../../../src/application/journey-date";
import { localeTag, localize, type Locale } from "../../../../src/application/i18n";
import { absoluteUrl, breadcrumbStructuredData } from "../../../../src/application/seo";
import { transitPageDataService } from "../../../../src/application/transit-data-service";
import { requestLocale } from "../../../request-locale";

interface PageProps
{
    params: Promise<{ operator: string; service: string }>;
}

export const dynamic = "force-dynamic";
const load = cache(async (operator: string, service: string) =>
{
    const number = journeyRefFromPath(service);
    return number ? transitPageDataService.getBusService(operator, number) : null;
});

export async function generateMetadata(props: PageProps): Promise<Metadata>
{
    const { operator, service } = await props.params;
    const canonical = busServicePath({ operatorSlug: operator, serviceNumber: journeyRefFromPath(service) ?? service });
    return transitMetadata(() => loadMetadata(props), canonical);
}

async function loadMetadata({ params }: PageProps): Promise<Metadata>
{
    const locale = await requestLocale();
    const { operator, service } = await params;
    const board = await load(operator, service);
    if (!board)
    {
        return { title: localize(locale, "Bus introuvable", "Bus not found", "Autobús no encontrado") };
    }
    const journey = board.example;
    return {
        title: localize(locale, `${journey.operatorName} ${journey.serviceNumber} : prochains départs et suivi`, `${journey.operatorName} ${journey.serviceNumber}: departures and tracking`, `${journey.operatorName} ${journey.serviceNumber}: salidas y seguimiento`),
        description: localize(locale, `Retrouvez les prochains départs du bus ${journey.serviceNumber} ${journey.operatorName}. Choisissez votre date et votre départ pour consulter les horaires et le suivi.`, `Find upcoming departures for ${journey.operatorName} bus ${journey.serviceNumber}. Choose your date and departure to view times and tracking.`, `Consulta las próximas salidas del autobús ${journey.serviceNumber} de ${journey.operatorName}. Elige la fecha y la salida para ver los horarios y el seguimiento.`),
        alternates: { canonical: busServicePath(journey) },
        robots: { index: true, follow: true }
    };
}

export default async function BusServicePage({ params }: PageProps)
{
    const locale = await requestLocale();
    const { operator, service } = await params;
    const number = journeyRefFromPath(service);
    const identity = number ? await transitPageDataService.getBusServiceIdentity(operator, number) : null;
    if (!identity)
    {
        notFound();
    }
    const canonical = busServicePath(identity);
    if (`/bus/${encodeURIComponent(operator)}/${encodeURIComponent(service)}` !== canonical)
    {
        permanentRedirect(canonical);
    }
    return (
        <TransitPage key={JSON.stringify(await params)} locale={locale} title={localize(locale, "Les départs de votre bus", "Your bus departures", "Las salidas de tu autobús")}>
            <BusServicePageContent params={params} locale={locale} />
        </TransitPage>
    );
}

async function BusServicePageContent({ params, locale }: PageProps & { locale: Locale })
{
    const { operator, service } = await params;
    const board = await load(operator, service);
    if (!board)
    {
        throw new Error("Horaires du bus indisponibles");
    }
    const { example, journeys } = board;
    const canonical = busServicePath(example);
    const dates = [...new Set(journeys.map((journey) => journey.serviceDate))].sort();
    const routes = [...new Map(journeys.map((journey) => [cityRoutePath(citySlug(journey.originCity), citySlug(journey.destinationCity)), journey])).entries()];
    const next = journeys[0];

    return (
        <JourneyUpdates journeys={journeys}>
            <div className="page-shell listing-page">
                <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb", "Migas de pan")}>
                    <Link href="/">{localize(locale, "Accueil", "Home", "Inicio")}</Link><span>›</span><span>{example.operatorName} · Bus {example.serviceNumber}</span>
                </nav>
                <header className="listing-heading">
                    <span className="section-kicker">{localize(locale, "Tous les départs de ce bus", "All departures for this bus", "Todas las salidas de este autobús")}</span>
                    <h1>{example.operatorName} <em>{example.serviceNumber}</em></h1>
                    <div className="route-identity"><OperatorLogo operatorSlug={example.operatorSlug} /><p>{example.originCity} → {example.destinationCity}</p></div>
                    <p>{localize(locale, "Choisissez votre date et votre départ. Les gares et les horaires sont indiqués pour chaque circulation.", "Choose your date and departure. Stations and times are shown for each journey.", "Elige la fecha y la salida. Las estaciones y los horarios se indican para cada trayecto.")}</p>
                    {next && <Link className="service-follow-link" href={journeyPath(next)}>{localize(locale, "Suivre le départ du", "Track the departure on", "Seguir la salida del")} {new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeZone: "Europe/Paris" }).format(new Date(`${next.serviceDate}T12:00:00Z`))} · {new Intl.DateTimeFormat(localeTag(locale), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(next.stops[0]?.aimedDepartureAt ?? `${next.serviceDate}T00:00:00Z`))} →</Link>}
                </header>
                {dates.length > 0 && <nav className="service-dates" aria-label={localize(locale, "Choisir une date", "Choose a date", "Elegir una fecha")}>
                    {dates.map((date) => <a href={`#date-${date}`} key={date}>{journeyDateLabel(journeys.find((journey) => journey.serviceDate === date)!, locale)}</a>)}
                </nav>}
                {dates.map((date) => <section className="journey-list-section service-date-section" id={`date-${date}`} key={date}>
                    <h2>{new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date(`${date}T12:00:00Z`))}</h2>
                    <div className="journey-list">{journeys.filter((journey) => journey.serviceDate === date).map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} locale={locale} />)}</div>
                </section>)}
                {journeys.length === 0 && <div className="empty-state"><h2>{localize(locale, "Aucun départ annoncé pour le moment", "No departures announced at the moment", "No hay salidas anunciadas por el momento")}</h2><p>{localize(locale, "Cette page reste disponible. Les prochains départs apparaîtront dès leur publication par le transporteur.", "This page remains available. Upcoming departures will appear when published by the operator.", "Esta página sigue disponible. Las próximas salidas aparecerán cuando las publique el operador.")}</p><Link href={cityRoutePath(citySlug(example.originCity), citySlug(example.destinationCity))}>{localize(locale, "Voir les autres bus sur cette liaison", "View other buses on this route", "Ver otros autobuses en esta ruta")}</Link></div>}
                <div className="route-station-links">{routes.map(([path, journey]) => <Link href={path} key={path}>{localize(locale, "Tous les bus", "All buses", "Todos los autobuses")} {journey.originCity} → {journey.destinationCity}</Link>)}</div>
                <StructuredData value={[breadcrumbStructuredData([{ name: "BusMinute", path: "/" }, { name: `${example.operatorName} ${example.serviceNumber}`, path: canonical }]), { "@context": "https://schema.org", "@type": "CollectionPage", name: `${example.operatorName} ${example.serviceNumber}`, url: absoluteUrl(canonical) }]} />
            </div>
        </JourneyUpdates>
    );
}
