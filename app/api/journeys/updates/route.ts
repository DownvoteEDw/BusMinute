import { transitDataService } from "../../../../src/application/transit-data-service.js";

export async function POST(request: Request): Promise<Response>
{
    const body = await request.json().catch(() => null) as { references?: unknown } | null;
    const references = body?.references;
    if (!Array.isArray(references) || references.length > 20
        || references.some((reference) => typeof reference !== "string" || reference.length === 0 || reference.length > 500))
    {
        return Response.json({ error: "Recherche invalide" }, { status: 400 });
    }
    const results = await Promise.allSettled([...new Set(references as string[])].map((reference) => transitDataService.getJourney(reference)));
    const journeys = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
    return Response.json({ journeys },
    {
        status: results.length > 0 && results.every((result) => result.status === "rejected") ? 503 : 200,
        headers: { "Cache-Control": "no-store, max-age=0" }
    });
}
