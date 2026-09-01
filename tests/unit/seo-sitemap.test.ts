import { describe, expect, it } from "vitest";
import type { SeoIndexView } from "../../src/application/journey-view.js";
import
{
    buildSitemapIndexXml,
    buildSitemapSectionXml,
    parseSitemapSection,
    sitemapResponse,
    sitemapSectionNames
} from "../../src/application/seo-sitemap.js";

const index: SeoIndexView = {
    cities: [{ slug: "paris" }, { slug: "orleans" }, { slug: "paris" }],
    stops: [{ stopId: "XPB" }, { stopId: "X&OS" }],
    routes: [{ originStopId: "XPB", destinationStopId: "XTO" }],
    departures: [{ citySlug: "paris", serviceDate: "2026-08-22" }],
    journeys: [{ journeyRef: "50819:2026-08-22" }]
};

describe("sitemaps SEO", () =>
{
    it("produit un index léger vers tous les sous-sitemaps", () =>
    {
        const xml = buildSitemapIndexXml("https://bus-minute.xyz/");

        expect(xml).toContain("<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
        expect(xml.match(/<sitemap>/g)).toHaveLength(sitemapSectionNames.length);

        for (const section of sitemapSectionNames)
        {
            expect(xml).toContain(`<loc>https://bus-minute.xyz/sitemaps/${section}.xml</loc>`);
        }
    });

    it("génère des URL canoniques triées, uniques et échappées", () =>
    {
        const cities = buildSitemapSectionXml("https://bus-minute.xyz", "cities", index);
        const stops = buildSitemapSectionXml("https://bus-minute.xyz", "stops", index);
        const journeys = buildSitemapSectionXml("https://bus-minute.xyz", "journeys", index);

        expect(cities.match(/<url>/g)).toHaveLength(2);
        expect(cities.indexOf("/ville/orleans")).toBeLessThan(cities.indexOf("/ville/paris"));
        expect(stops).toContain("https://bus-minute.xyz/gares/X%26OS");
        expect(journeys).toContain("https://bus-minute.xyz/suivi/50819%3A2026-08-22");
        expect(cities).not.toContain("<lastmod>");
        expect(cities).not.toContain("<changefreq>");
        expect(cities).not.toContain("<priority>");
    });

    it("refuse les chemins qui ne sont pas des sous-sitemaps déclarés", () =>
    {
        expect(parseSitemapSection("cities.xml")).toBe("cities");
        expect(parseSitemapSection("cities")).toBeNull();
        expect(parseSitemapSection("unknown.xml")).toBeNull();
    });

    it("sert du XML stable, cacheable et de taille déclarée", async () =>
    {
        const xml = buildSitemapSectionXml("https://bus-minute.xyz", "journeys", index);
        const response = sitemapResponse(xml);

        expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
        expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
        expect(Number(response.headers.get("content-length"))).toBe(Buffer.byteLength(xml, "utf8"));
        expect(await response.text()).toBe(xml);
    });
});
