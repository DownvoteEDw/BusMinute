import type { JourneyView } from "./journey-view.js";
import { isJourneyCompleted } from "./seo.js";

export function shouldRefreshJourney(journey: JourneyView, now = new Date()): boolean
{
    return journey.realtimeAvailable
        && !isJourneyCompleted(journey, now)
        && journey.realtimeStatus !== "not_offered"
        && journey.realtimeStatus !== "outside_tracking_period";
}
