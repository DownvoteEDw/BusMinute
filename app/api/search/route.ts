import { transitDataService } from "../../../src/application/transit-data-service.js";
import { isSearchQueryWithinLimits } from "../../../src/application/search-query.js";

const responseHeaders = {
    "Cache-Control": "no-store, max-age=0"
};

export async function GET(request: Request): Promise<Response>
{
    const query = new URL(request.url).searchParams.get("q") ?? "";

    if (!isSearchQueryWithinLimits(query))
    {
        return Response.json(
        {
            error: "Recherche invalide.",
            journeys: [],
            places: []
        },
        {
            headers: responseHeaders,
            status: 400
        });
    }

    if (query.trim().length < 2)
    {
        return Response.json({ journeys: [], places: [] }, { headers: responseHeaders });
    }

    try
    {
        const [journeys, places] = await Promise.all(
        [
            transitDataService.search(query),
            transitDataService.searchPlaces(query)
        ]);
        return Response.json({ journeys, places }, { headers: responseHeaders });
    }
    catch
    {
        return Response.json(
        {
            error: "Les données sont momentanément indisponibles.",
            journeys: [],
            places: []
        },
        {
            headers: responseHeaders,
            status: 503
        });
    }
}
