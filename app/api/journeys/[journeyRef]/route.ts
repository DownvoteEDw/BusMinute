import { transitDataService } from "../../../../src/application/transit-data-service.js";
import { journeyRefFromPath } from "../../../../src/application/journey-url.js";

interface RouteProps
{
    params: Promise<{ journeyRef: string }>;
}

export async function GET(_request: Request, { params }: RouteProps): Promise<Response>
{
    const { journeyRef: rawJourneyRef } = await params;
    const journeyRef = journeyRefFromPath(rawJourneyRef);
    const journey = journeyRef ? await transitDataService.getJourney(journeyRef) : null;

    if (!journey)
    {
        return Response.json({ error: "Bus introuvable" }, { status: 404 });
    }

    return Response.json({ journey },
    {
        headers: {
            "Cache-Control": "public, max-age=15, stale-while-revalidate=45"
        }
    });
}
