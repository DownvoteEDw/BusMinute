import
{
    createPassengerReport,
    isPassengerReportType,
    listPassengerReports
} from "../../../src/application/passenger-reports.js";
import { transitDataService } from "../../../src/application/transit-data-service.js";
import { isJourneyCompleted } from "../../../src/application/seo.js";

const recentSubmissions = new Map<string, number>();

export async function GET(request: Request): Promise<Response>
{
    const journeyRef = new URL(request.url).searchParams.get("journeyRef")?.trim();

    if (!journeyRef)
    {
        return Response.json({ error: "journeyRef est requis" }, { status: 400 });
    }

    return Response.json({ reports: await listPassengerReports(journeyRef) });
}

export async function POST(request: Request): Promise<Response>
{
    const body = await request.json() as Record<string, unknown>;
    const journeyRef = typeof body.journeyRef === "string" ? body.journeyRef.trim() : "";
    const stopId = typeof body.stopId === "string" ? body.stopId.trim() || null : null;
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 280) || null : null;

    if (!journeyRef
        || journeyRef.length > 160
        || (stopId?.length ?? 0) > 100
        || !isPassengerReportType(body.type))
    {
        return Response.json({ error: "Signalement invalide" }, { status: 400 });
    }

    const journey = await transitDataService.getJourney(journeyRef);
    if (!journey)
    {
        return Response.json({ error: "Circulation introuvable" }, { status: 404 });
    }
    if (isJourneyCompleted(journey))
    {
        return Response.json({ error: "Les signalements sont fermés pour cette circulation terminée." }, { status: 409 });
    }

    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const fingerprint = `${forwardedFor}:${request.headers.get("user-agent") ?? "unknown"}`;
    const rateLimitKey = `${fingerprint}:${journeyRef}`;
    const previous = recentSubmissions.get(rateLimitKey) ?? 0;
    const now = Date.now();

    if (now - previous < 10_000)
    {
        return Response.json({ error: "Patientez quelques secondes avant un nouveau signalement." }, { status: 429 });
    }

    if (recentSubmissions.size >= 10_000)
    {
        for (const [key, submittedAt] of recentSubmissions)
        {
            if (now - submittedAt > 60_000)
            {
                recentSubmissions.delete(key);
            }
        }

        if (recentSubmissions.size >= 10_000)
        {
            const oldestKey = recentSubmissions.keys().next().value;

            if (typeof oldestKey === "string")
            {
                recentSubmissions.delete(oldestKey);
            }
        }
    }

    recentSubmissions.set(rateLimitKey, now);
    const report = await createPassengerReport({
        journeyRef,
        stopId,
        type: body.type,
        message,
        fingerprint
    });
    return Response.json({ report }, { status: 201 });
}
