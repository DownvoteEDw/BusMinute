import type { MetadataRoute } from "next";
import { transitDataService } from "../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap>
{
    const origin = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const now = new Date();
    const index = await transitDataService.getSeoIndex();

    return [
        {
            url: origin,
            lastModified: now,
            changeFrequency: "daily",
            priority: 1
        },
        {
            url: `${origin}/villes`,
            lastModified: now,
            changeFrequency: "daily",
            priority: 0.9
        },
        {
            url: `${origin}/sources`,
            lastModified: now,
            changeFrequency: "monthly",
            priority: 0.4
        },
        ...index.cities.map((city) =>
        {
            return {
                url: `${origin}/ville/${city.slug}`,
                lastModified: now,
                changeFrequency: "hourly" as const,
                priority: 0.8
            };
        }),
        ...index.stops.map((stop) =>
        {
            return {
                url: `${origin}/gares/${encodeURIComponent(stop.stopId)}`,
                lastModified: now,
                changeFrequency: "hourly" as const,
                priority: 0.8
            };
        }),
        ...index.routes.map((route) =>
        {
            return {
                url: `${origin}/trajets/${encodeURIComponent(route.originStopId)}/${encodeURIComponent(route.destinationStopId)}`,
                lastModified: now,
                changeFrequency: "hourly" as const,
                priority: 0.7
            };
        }),
        ...index.departures.map((departure) =>
        {
            return {
                url: `${origin}/departs/${departure.citySlug}/${departure.serviceDate}`,
                lastModified: now,
                changeFrequency: "hourly" as const,
                priority: 0.7
            };
        }),
        ...index.journeys.map((journey) =>
        {
            return {
                url: `${origin}/suivi/${encodeURIComponent(journey.journeyRef)}`,
                lastModified: now,
                changeFrequency: "always" as const,
                priority: 0.9
            };
        })
    ];
}
