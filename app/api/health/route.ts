import { getDatabasePool } from "../../../src/db/database";
import { transitDataService } from "../../../src/application/transit-data-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response>
{
    const pool = getDatabasePool();

    if (!pool)
    {
        return Response.json({ status: "ok", database: "disabled" },
        {
            headers: {
                "Cache-Control": "no-store"
            }
        });
    }

    try
    {
        await pool.query("SELECT 1");
        const sync = await transitDataService.getSyncStatuses();
        const realtime = sync.find((item) => item.source === "SIRI_ESTIMATED_TIMETABLE");
        const realtimeAgeSeconds = realtime?.sourceTimestamp
            ? Math.max(0, Math.round((Date.now() - new Date(realtime.sourceTimestamp).getTime()) / 1000))
            : null;
        const dataStatus = realtime?.status === "SUCCEEDED" && realtimeAgeSeconds !== null && realtimeAgeSeconds <= 300
            ? "fresh"
            : "waiting";

        return Response.json(
        {
            status: "ok",
            database: "connected",
            data: dataStatus,
            realtimeAgeSeconds,
            sync
        },
        {
            headers: {
                "Cache-Control": "no-store"
            }
        });
    }
    catch
    {
        return Response.json({ status: "error", database: "unavailable" },
        {
            status: 503,
            headers: {
                "Cache-Control": "no-store"
            }
        });
    }
}
