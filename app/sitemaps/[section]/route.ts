import
{
    getSitemapSectionXml,
    parseSitemapSection,
    sitemapResponse
} from "../../../src/application/seo-sitemap";

interface RouteProps
{
    params: Promise<{ section: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteProps): Promise<Response>
{
    const { section: rawSection } = await params;
    const section = parseSitemapSection(rawSection);

    if (!section)
    {
        return new Response("Not found",
        {
            status: 404,
            headers: {
                "Cache-Control": "public, max-age=3600",
                "Content-Type": "text/plain; charset=utf-8"
            }
        });
    }

    return sitemapResponse(await getSitemapSectionXml(section));
}
