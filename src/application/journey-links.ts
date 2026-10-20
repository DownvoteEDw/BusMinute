import { busServicePath, cityRoutePath } from "./journey-url.js";
import { citySlug, type JourneyView } from "./journey-view.js";
import { isJourneyCompleted } from "./seo.js";

export interface RouteLinkView
{
    path: string;
    originCity: string;
    destinationCity: string;
    journeyCount: number;
}

export interface ServiceLinkView
{
    path: string;
    operatorName: string;
    serviceNumber: string;
    originCity: string;
    destinationCity: string;
    journeyCount: number;
}

export interface JourneyLinksView
{
    routes: RouteLinkView[];
    services: ServiceLinkView[];
}

export function journeyLinks(journeys: JourneyView[], originSlugs: string[], limit: number, now = new Date()): JourneyLinksView
{
    const origins = new Set(originSlugs);
    const routes = new Map<string, RouteLinkView>();
    const services = new Map<string, ServiceLinkView>();

    for (const journey of journeys)
    {
        if (journey.cancelled || isJourneyCompleted(journey, now))
        {
            continue;
        }

        const start = journey.stops.findIndex((stop) => origins.has(citySlug(stop.city)));
        const origin = journey.stops[start];

        if (!origin)
        {
            continue;
        }

        const servicePath = busServicePath(journey);
        const service = services.get(servicePath) ?? {
            path: servicePath,
            operatorName: journey.operatorName,
            serviceNumber: journey.serviceNumber,
            originCity: journey.originCity,
            destinationCity: journey.destinationCity,
            journeyCount: 0
        };
        service.journeyCount += 1;
        services.set(servicePath, service);

        const originSlug = citySlug(origin.city);
        const destinations = new Map(journey.stops.slice(start + 1)
            .filter((stop) => citySlug(stop.city) !== originSlug)
            .map((stop) => [citySlug(stop.city), stop.city]));

        for (const [destinationSlug, destinationCity] of destinations)
        {
            const routePath = cityRoutePath(originSlug, destinationSlug);
            const route = routes.get(routePath) ?? { path: routePath, originCity: origin.city, destinationCity, journeyCount: 0 };
            route.journeyCount += 1;
            routes.set(routePath, route);
        }
    }

    return {
        routes: [...routes.values()].sort((first, second) =>
        {
            return second.journeyCount - first.journeyCount
                || first.originCity.localeCompare(second.originCity, "fr")
                || first.destinationCity.localeCompare(second.destinationCity, "fr");
        }).slice(0, limit),
        services: [...services.values()].sort((first, second) =>
        {
            return second.journeyCount - first.journeyCount
                || first.operatorName.localeCompare(second.operatorName, "fr")
                || first.serviceNumber.localeCompare(second.serviceNumber, "fr", { numeric: true });
        }).slice(0, limit)
    };
}
