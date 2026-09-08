import { notFound, permanentRedirect } from "next/navigation";
import { journeyPath, journeyRefFromPath } from "../../../src/application/journey-url";
import { transitDataService } from "../../../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export default async function LegacyJourneyPage({ params }: { params: Promise<{ journeyRef: string }> })
{
    const { journeyRef: segment } = await params;
    const reference = journeyRefFromPath(segment);
    const journey = reference ? await transitDataService.getJourney(reference) : null;
    if (!journey)
    {
        notFound();
    }
    permanentRedirect(journeyPath(journey));
}
