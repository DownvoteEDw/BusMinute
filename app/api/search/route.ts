import { transitDataService } from "../../../src/application/transit-data-service";

const responseHeaders = {
    "Cache-Control": "no-store, max-age=0"
};

export async function GET(request: Request): Promise<Response>
{
    const query = new URL(request.url).searchParams.get("q") ?? "";

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
