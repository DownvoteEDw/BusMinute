import { transitDataService } from "../../../../src/application/transit-data-service.js";
import { JsonBodyTooLargeError, readJsonBody } from "../../../../src/application/http-json.js";

export async function POST(request: Request): Promise<Response>
{
    let body: { references?: unknown } | null;

    try
    {
        body = await readJsonBody(request) as { references?: unknown } | null;
    }
    catch (error)
    {
        return Response.json(
        {
            error: error instanceof JsonBodyTooLargeError ? "Recherche trop volumineuse" : "Recherche invalide"
        },
        {
            status: error instanceof JsonBodyTooLargeError ? 413 : 400
        });
    }

    const references = body?.references;
    if (!Array.isArray(references) || references.length > 20
        || references.some((reference) => typeof reference !== "string" || reference.length === 0 || reference.length > 500))
    {
        return Response.json({ error: "Recherche invalide" }, { status: 400 });
    }
    const uniqueReferences = [...new Set(references as string[])];
    const results: PromiseSettledResult<Awaited<ReturnType<typeof transitDataService.getJourney>>>[] = [];

    for (let offset = 0; offset < uniqueReferences.length; offset += 4)
    {
        results.push(...await Promise.allSettled(
            uniqueReferences.slice(offset, offset + 4).map((reference) => transitDataService.getJourney(reference))
        ));
    }

    const journeys = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
    return Response.json({ journeys },
    {
        status: results.length > 0 && results.every((result) => result.status === "rejected") ? 503 : 200,
        headers: { "Cache-Control": "no-store, max-age=0" }
    });
}
