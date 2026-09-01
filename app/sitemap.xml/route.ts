import
{
    buildSitemapIndexXml,
    sitemapOrigin,
    sitemapResponse
} from "../../src/application/seo-sitemap";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response>
{
    return sitemapResponse(buildSitemapIndexXml(sitemapOrigin()));
}
