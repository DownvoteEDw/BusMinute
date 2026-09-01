import { transitDataService } from "../../../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response>
{
    try
    {
        const journeys = await transitDataService.getLiveBoard(7);
        const updatedAt = journeys.reduce<string | null>((latest, journey) =>
        {
            if (!latest || new Date(journey.updatedAt) > new Date(latest))
            {
                return journey.updatedAt;
            }

            return latest;
        }, null);
        return Response.json({ journeys, updatedAt },
        {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    }
    catch
    {
        return Response.json(
        {
            error: "Le panneau temps réel est momentanément indisponible.",
            journeys: [],
            updatedAt: null
        },
        {
            status: 503,
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    }
}
