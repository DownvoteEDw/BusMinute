import { notFound, permanentRedirect } from "next/navigation";
import { journeyRefFromPath } from "../../../src/application/journey-url";
import { journeyRedirectPath } from "../../../src/application/seo";
import { transitPageDataService } from "../../../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export default async function LegacyJourneyPage({ params }: { params: Promise<{ journeyRef: string }> })
{
    const { journeyRef: segment } = await params;
    const reference = journeyRefFromPath(segment);
    const journey = reference ? await transitPageDataService.getJourney(reference) : null;
    if (!journey)
    {
        notFound();
    }
    permanentRedirect(journeyRedirectPath(journey));
}
