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
    routes: [{ originStopId: "XPB", destinationStopId: "XTO" }]
};

describe("sitemaps SEO", () =>
{
    it("référence les pages permanentes sans les circulations datées", () =>
    {
        const current = { ...index, services: ["/bus/flixbus/1606", "/bus/flixbus/1606"], cityRoutes: ["/trajets/paris/lyon"] };
        expect(buildSitemapSectionXml("https://bus-minute.xyz", "services", current).match(/<url>/g)).toHaveLength(1);
        const routes = buildSitemapSectionXml("https://bus-minute.xyz", "routes", current);
        expect(routes).toContain("/trajets/paris/lyon");
        expect(routes).not.toContain("/trajets/XPB/XTO");
        expect(parseSitemapSection("journeys.xml")).toBeNull();
        expect(parseSitemapSection("departures.xml")).toBeNull();
        expect(buildSitemapIndexXml("https://bus-minute.xyz")).not.toContain("/suivi/");
    });

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

        expect(cities.match(/<url>/g)).toHaveLength(2);
        expect(cities.indexOf("/ville/orleans")).toBeLessThan(cities.indexOf("/ville/paris"));
        expect(stops).toContain("https://bus-minute.xyz/gares/X%26OS");
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
        const xml = buildSitemapSectionXml("https://bus-minute.xyz", "cities", index);
        const response = sitemapResponse(xml);

        expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
        expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
        expect(Number(response.headers.get("content-length"))).toBe(Buffer.byteLength(xml, "utf8"));
        expect(await response.text()).toBe(xml);
    });
});
