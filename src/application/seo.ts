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
    const fallbackEnd = new Date(`${journey.serviceDate}T23:59:59Z`).getTime();
    const effectiveEnd = Number.isFinite(journeyEnd) ? journeyEnd : fallbackEnd;

    return Number.isFinite(effectiveEnd)
        && now.getTime() > effectiveEnd + journeyIndexingGracePeriodMilliseconds;
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
