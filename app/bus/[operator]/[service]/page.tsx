import { transitMetadata } from "../../../transit-metadata";
import { JourneyUpdates } from "../../../../components/journey-updates";
import { TransitPage } from "../../../../components/transit-page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { JourneyCard } from "../../../../components/journey-card";
import { JourneyTracker } from "../../../../components/journey-tracker";
import { OperatorLogo } from "../../../../components/operator-logo";
import { StructuredData } from "../../../../components/structured-data";
import { busServicePath, cityRoutePath, journeyRefFromPath } from "../../../../src/application/journey-url";
import { citySlug, type JourneyView } from "../../../../src/application/journey-view";
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
    const route = `${journey.originCity} → ${journey.destinationCity}`;
    const punctuality = punctualitySentence(journey, locale);
    return {
        title: localize(locale, `${journey.operatorName} ${journey.serviceNumber} ${route} : suivi en direct et retards`, `${journey.operatorName} ${journey.serviceNumber} ${route}: live tracking and delays`, `${journey.operatorName} ${journey.serviceNumber} ${route}: seguimiento en directo y retrasos`),
        description: `${localize(locale, `Suivez le bus ${journey.serviceNumber} ${journey.operatorName} ${route} en direct : heure réelle à chaque arrêt, retards et prochains départs.`, `Track ${journey.operatorName} bus ${journey.serviceNumber} ${route} live: real times at every stop, delays and upcoming departures.`, `Sigue en directo el autobús ${journey.serviceNumber} de ${journey.operatorName} ${route}: hora real en cada parada, retrasos y próximas salidas.`)}${punctuality ? ` ${punctuality}` : ""}`,
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
    // Sans départ à venir, la dernière circulation connue garde la page utile : arrêts, horaires réels et ponctualité.
    const featured = next ?? (example.stops.length > 1 ? example : null);
    const viaCities = [...new Set(example.stops.slice(1, -1).map((stop) => stop.city))]
        .filter((city) => city !== example.originCity && city !== example.destinationCity);
    const via = new Intl.ListFormat(localeTag(locale), { style: "long", type: "conjunction" }).format(viaCities);
    const punctuality = punctualitySentence(example, locale);

    return (
        <JourneyUpdates journeys={journeys}>
            <div className="page-shell listing-page tracker-page">
                <nav className="breadcrumbs" aria-label={localize(locale, "Fil d’Ariane", "Breadcrumb", "Migas de pan")}>
                    <Link href="/">{localize(locale, "Accueil", "Home", "Inicio")}</Link><span>›</span><span>{example.operatorName} · Bus {example.serviceNumber}</span>
                </nav>
                <header className="listing-heading">
                    <span className="section-kicker">{localize(locale, "Suivi en direct et ponctualité", "Live tracking and punctuality", "Seguimiento en directo y puntualidad")}</span>
                    <h1>{example.operatorName} <em>{example.serviceNumber}</em></h1>
                    <div className="route-identity"><OperatorLogo operatorSlug={example.operatorSlug} /><p>{example.originCity} → {example.destinationCity}</p></div>
                    <p>{viaCities.length > 0
                        ? localize(locale, `Via ${via}.`, `Via ${via}.`, `Vía ${via}.`)
                        : localize(locale, "Trajet direct, sans arrêt intermédiaire.", "Direct journey with no intermediate stop.", "Trayecto directo, sin paradas intermedias.")}</p>
                    {punctuality && <p className="service-punctuality">{punctuality}</p>}
                </header>
                {journeys.length === 0 && <div className="empty-state"><h2>{localize(locale, "Aucun départ annoncé pour le moment", "No departures announced at the moment", "No hay salidas anunciadas por el momento")}</h2><p>{localize(locale, "Cette page reste disponible. Les prochains départs apparaîtront dès leur publication par le transporteur.", "This page remains available. Upcoming departures will appear when published by the operator.", "Esta página sigue disponible. Las próximas salidas aparecerán cuando las publique el operador.")}</p><Link href={cityRoutePath(citySlug(example.originCity), citySlug(example.destinationCity))}>{localize(locale, "Voir les autres bus sur cette liaison", "View other buses on this route", "Ver otros autobuses en esta ruta")}</Link></div>}
                {featured && <section className="service-live" aria-labelledby="service-live-title">
                    <h2 id="service-live-title">{next
                        ? localize(locale, `${journeyDateLabel(featured, locale)} · départ à ${departureTime(featured, locale)}`, `${journeyDateLabel(featured, locale)} · departs at ${departureTime(featured, locale)}`, `${journeyDateLabel(featured, locale)} · salida a las ${departureTime(featured, locale)}`)
                        : localize(locale, `Dernier trajet connu · ${longDate(featured.serviceDate, locale)}`, `Last known journey · ${longDate(featured.serviceDate, locale)}`, `Último trayecto conocido · ${longDate(featured.serviceDate, locale)}`)}</h2>
                    <JourneyTracker key={featured.journeyRef} initialJourney={featured} initialNow={Date.now()} locale={locale} completed={!next} mapStyleUrl={process.env.MAP_STYLE_URL || undefined} />
                </section>}
                {dates.length > 0 && <nav className="service-dates" aria-label={localize(locale, "Choisir une date", "Choose a date", "Elegir una fecha")}>
                    <span className="section-kicker">{localize(locale, "Tous les départs à venir", "All upcoming departures", "Todas las próximas salidas")}</span>
                    {dates.map((date) => <a href={`#date-${date}`} key={date}>{journeyDateLabel(journeys.find((journey) => journey.serviceDate === date)!, locale)}</a>)}
                </nav>}
                {dates.map((date) => <section className="journey-list-section service-date-section" id={`date-${date}`} key={date}>
                    <h2>{new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "full", timeZone: "Europe/Paris" }).format(new Date(`${date}T12:00:00Z`))}</h2>
                    <div className="journey-list">{journeys.filter((journey) => journey.serviceDate === date).map((journey) => <JourneyCard journey={journey} key={journey.journeyRef} locale={locale} />)}</div>
                </section>)}
                <div className="route-station-links">{routes.map(([path, journey]) => <Link href={path} key={path}>{localize(locale, "Tous les bus", "All buses", "Todos los autobuses")} {journey.originCity} → {journey.destinationCity}</Link>)}</div>
                <StructuredData value={[breadcrumbStructuredData([{ name: "BusMinute", path: "/" }, { name: `${example.operatorName} ${example.serviceNumber}`, path: canonical }]), { "@context": "https://schema.org", "@type": "CollectionPage", name: `${example.operatorName} ${example.serviceNumber}`, url: absoluteUrl(canonical) }]} />
            </div>
        </JourneyUpdates>
    );
}

function punctualitySentence(journey: JourneyView, locale: Locale): string | null
{
    const punctuality = journey.punctuality;
    if (!punctuality)
    {
        return null;
    }
    const minutes = Math.round(punctuality.averageDelaySeconds / 60);
    const average = minutes > 0
        ? localize(locale, `${minutes} min de retard en moyenne à l’arrivée`, `${minutes} min late on average at arrival`, `${minutes} min de retraso medio en la llegada`)
        : localize(locale, "à l’heure en moyenne à l’arrivée", "on time on average at arrival", "puntual de media en la llegada");
    return localize(
        locale,
        `Sur ${punctuality.windowDays} jours : ${average}, ${punctuality.onTimePercentage} % des arrivées à moins de ${punctuality.thresholdMinutes} min d’écart.`,
        `Over ${punctuality.windowDays} days: ${average}, ${punctuality.onTimePercentage}% of arrivals within ${punctuality.thresholdMinutes} min of schedule.`,
        `En ${punctuality.windowDays} días: ${average}, el ${punctuality.onTimePercentage} % de las llegadas con menos de ${punctuality.thresholdMinutes} min de diferencia.`
    );
}

function departureTime(journey: JourneyView, locale: Locale): string
{
    return new Intl.DateTimeFormat(localeTag(locale), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
        .format(new Date(journey.stops[0]?.aimedDepartureAt ?? `${journey.serviceDate}T00:00:00Z`));
}

function longDate(value: string, locale: Locale): string
{
    return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(`${value}T12:00:00Z`));
}
