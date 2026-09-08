import type { Pool } from "pg";
import type { TransitDataService } from "./transit-data-service.js";

export async function backfillJourneyLinks(pool: Pool, service: Pick<TransitDataService, "getJourney">): Promise<{ saved: number; unavailable: number }>
{
    let cursor = "";
    let saved = 0;
    let unavailable = 0;
    while (true)
    {
        const result = await pool.query<{ reference: string }>(
            `SELECT DISTINCT instance.siri_journey_ref AS reference
             FROM trip_instances instance
             WHERE instance.siri_journey_ref > $1
               AND NOT EXISTS (SELECT 1 FROM journey_publications publication WHERE publication.journey_ref = instance.siri_journey_ref)
             ORDER BY reference LIMIT 100`, [cursor]
        );
        if (result.rows.length === 0)
        {
            return { saved, unavailable };
        }
        for (let offset = 0; offset < result.rows.length; offset += 4)
        {
            const journeys = await Promise.all(result.rows.slice(offset, offset + 4).map(({ reference }) => service.getJourney(reference)));
            saved += journeys.filter(Boolean).length;
            unavailable += journeys.filter((journey) => !journey).length;
        }
        cursor = result.rows[result.rows.length - 1]!.reference;
    }
}
