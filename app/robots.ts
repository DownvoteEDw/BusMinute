import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots
{
    const origin = process.env.SITE_URL ?? "http://localhost:3000";

    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // Les préchargements Next.js (?_rsc=) ne sont pas des pages : ils consommaient l'essentiel du crawl.
            disallow: ["/api/", "/recherche", "/*_rsc="]
        },
        sitemap: `${origin}/sitemap.xml`
    };
}
