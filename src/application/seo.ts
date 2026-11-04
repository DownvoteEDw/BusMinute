import { busServicePath, journeyPath } from "./journey-url.js";

export interface BreadcrumbItem
{
    name: string;
    path: string;
}

export interface JourneySeoTiming
{
    serviceDate: string;
    realtimeAvailable?: boolean;
    realtimeStatus?: "live" | "scheduled_only" | "not_offered" | "temporarily_unavailable" | "outside_tracking_period";
    stops: Array<{
        aimedArrivalAt: string | null;
        expectedArrivalAt: string | null;
        actualArrivalAt: string | null;
        aimedDepartureAt: string | null;
        expectedDepartureAt: string | null;
        actualDepartureAt: string | null;
    }>;
}

const journeyIndexingGracePeriodMilliseconds = 48 * 60 * 60 * 1000;
const journeyServiceRedirectDelayMilliseconds = 7 * 24 * 60 * 60 * 1000;
const journeyRealtimeCompletionGracePeriodMilliseconds = 6 * 60 * 60 * 1000;

export function absoluteUrl(path: string): string
{
    return new URL(path, process.env.SITE_URL ?? "http://localhost:3000").toString();
}

export function breadcrumbStructuredData(items: BreadcrumbItem[]): object
{
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) =>
        {
            return {
                "@type": "ListItem",
                position: index + 1,
                name: item.name,
                item: absoluteUrl(item.path)
            };
        })
    };
}

export function isJourneyOutsideIndexingWindow(
    journey: JourneySeoTiming,
    now = new Date()
): boolean
{
    const end = journeyEndTime(journey);
    return Number.isFinite(end) && now.getTime() > end + journeyIndexingGracePeriodMilliseconds;
}

// Une circulation terminée depuis une semaine transmet sa visibilité à la page permanente de sa ligne.
export function journeyRedirectPath(
    journey: JourneySeoTiming & { journeyRef: string; publicPath?: string; operatorSlug: string; serviceNumber: string },
    now = new Date()
): string
{
    const end = journeyEndTime(journey);
    return Number.isFinite(end) && now.getTime() > end + journeyServiceRedirectDelayMilliseconds
        ? busServicePath(journey)
        : journeyPath(journey);
}

function journeyEndTime(journey: JourneySeoTiming): number
{
    const timestamps = journey.stops.flatMap((stop) =>
    {
        return [
            stop.aimedArrivalAt,
            stop.expectedArrivalAt,
            stop.actualArrivalAt,
            stop.aimedDepartureAt,
            stop.expectedDepartureAt,
            stop.actualDepartureAt
        ];
    });
    const journeyEnd = timestamps.reduce<number>((latest, value) =>
    {
        if (!value)
        {
            return latest;
        }

        const timestamp = new Date(value).getTime();
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, Number.NEGATIVE_INFINITY);
    return Number.isFinite(journeyEnd) ? journeyEnd : new Date(`${journey.serviceDate}T23:59:59Z`).getTime();
}

export function isJourneyCompleted(journey: JourneySeoTiming & { status?: string }, now = new Date()): boolean
{
    if (journey.status === "arrived")
    {
        return true;
    }
    const last = journey.stops[journey.stops.length - 1];
    const end = last?.actualArrivalAt ?? last?.actualDepartureAt ?? last?.expectedArrivalAt
        ?? last?.expectedDepartureAt ?? last?.aimedArrivalAt ?? last?.aimedDepartureAt;
    const timestamp = new Date(end ?? `${journey.serviceDate}T23:59:59Z`).getTime();
    if (!Number.isFinite(timestamp) || timestamp >= now.getTime())
    {
        return false;
    }
    const realtimeCanStillUpdate = journey.realtimeAvailable
        && journey.realtimeStatus !== "not_offered"
        && journey.realtimeStatus !== "outside_tracking_period";
    return !realtimeCanStillUpdate
        || timestamp + journeyRealtimeCompletionGracePeriodMilliseconds < now.getTime();
}
