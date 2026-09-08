import type { SeoIndexView } from "./journey-view.js";
import { journeyPath } from "./journey-url.js";
import { transitDataService } from "./transit-data-service.js";

export const sitemapSectionNames = [
    "static",
    "cities",
    "stops",
    "routes",
    "departures",
    "services",
    "journeys"
] as const;

export type SitemapSection = typeof sitemapSectionNames[number];

const sitemapCacheLifetimeMilliseconds = 3_600_000;

interface TimedSeoIndex
{
    value: SeoIndexView;
    expiresAt: number;
}

let seoIndexCache: TimedSeoIndex | null = null;
let seoIndexPromise: Promise<SeoIndexView> | null = null;

export function sitemapOrigin(): string
{
    return normalizeOrigin(process.env.SITE_URL ?? "http://localhost:3000");
}

export function buildSitemapIndexXml(origin: string): string
{
    const normalizedOrigin = normalizeOrigin(origin);
    const entries = sitemapSectionNames.map((section) =>
    {
        return [
            "  <sitemap>",
            `    <loc>${escapeXml(`${normalizedOrigin}/sitemaps/${section}.xml`)}</loc>`,
            "  </sitemap>"
        ].join("\n");
    });

    return [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        ...entries,
        "</sitemapindex>",
        ""
    ].join("\n");
}

export function buildSitemapSectionXml(
    origin: string,
    section: SitemapSection,
    index: SeoIndexView
): string
{
    const normalizedOrigin = normalizeOrigin(origin);
    const entries = sitemapPaths(section, index).map((path) =>
    {
        return [
            "  <url>",
            `    <loc>${escapeXml(`${normalizedOrigin}${path}`)}</loc>`,
            "  </url>"
        ].join("\n");
    });

    return [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
        ...entries,
        "</urlset>",
        ""
    ].join("\n");
}

export async function getSitemapSectionXml(section: SitemapSection): Promise<string>
{
    const index = await getSeoIndex();
    return buildSitemapSectionXml(sitemapOrigin(), section, index);
}

export function parseSitemapSection(value: string): SitemapSection | null
{
    if (!value.endsWith(".xml"))
    {
        return null;
    }

    const section = value.slice(0, -4);
    return sitemapSectionNames.find((candidate) => candidate === section) ?? null;
}

export function sitemapResponse(xml: string): Response
{
    return new Response(xml,
    {
        headers: {
            "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400, no-transform",
            "Content-Length": Buffer.byteLength(xml, "utf8").toString(),
            "Content-Type": "application/xml; charset=utf-8",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

function sitemapPaths(section: SitemapSection, index: SeoIndexView): string[]
{
    switch (section)
    {
        case "static":
            return ["", "/villes"];
        case "cities":
            return uniqueSorted(index.cities.map((city) => `/ville/${city.slug}`));
        case "stops":
            return uniqueSorted(index.stops.map((stop) => `/gares/${encodeURIComponent(stop.stopId)}`));
        case "routes":
            return uniqueSorted([...(index.cityRoutes ?? []), ...index.routes.map((route) =>
            {
                return `/trajets/${encodeURIComponent(route.originStopId)}/${encodeURIComponent(route.destinationStopId)}`;
            })]);
        case "services":
            return uniqueSorted(index.services ?? []);
        case "departures":
            return uniqueSorted(index.departures.map((departure) =>
            {
                return `/departs/${departure.citySlug}/${departure.serviceDate}`;
            }));
        case "journeys":
            return uniqueSorted(index.journeys.map((journey) =>
            {
                return journeyPath(journey);
            }));
    }
}

async function getSeoIndex(): Promise<SeoIndexView>
{
    if (seoIndexCache && seoIndexCache.expiresAt > Date.now())
    {
        return seoIndexCache.value;
    }

    if (!seoIndexPromise)
    {
        seoIndexPromise = transitDataService.getSeoIndex()
            .then((value) =>
            {
                seoIndexCache = {
                    value,
                    expiresAt: Date.now() + sitemapCacheLifetimeMilliseconds
                };
                return value;
            })
            .catch((error: unknown) =>
            {
                if (seoIndexCache)
                {
                    return seoIndexCache.value;
                }

                throw error;
            })
            .finally(() =>
            {
                seoIndexPromise = null;
            });
    }

    return seoIndexPromise;
}

function normalizeOrigin(origin: string): string
{
    return origin.replace(/\/+$/, "");
}

function uniqueSorted(values: string[]): string[]
{
    return [...new Set(values)].sort((first, second) => first.localeCompare(second, "fr"));
}

function escapeXml(value: string): string
{
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
