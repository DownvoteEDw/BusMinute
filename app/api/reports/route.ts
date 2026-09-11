import
{
    createPassengerReport,
    isPassengerReportType,
    listPassengerReports,
    PassengerReportRateLimitError
} from "../../../src/application/passenger-reports.js";
import { JsonBodyTooLargeError, readJsonBody } from "../../../src/application/http-json.js";
import { transitDataService } from "../../../src/application/transit-data-service.js";
import { isJourneyCompleted } from "../../../src/application/seo.js";

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
    let body: Record<string, unknown>;

    try
    {
        const parsed = await readJsonBody(request);

        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        {
            return Response.json({ error: "Signalement invalide" }, { status: 400 });
        }

        body = parsed as Record<string, unknown>;
    }
    catch (error)
    {
        return Response.json(
        {
            error: error instanceof JsonBodyTooLargeError ? "Signalement trop volumineux" : "Signalement invalide"
        },
        {
            status: error instanceof JsonBodyTooLargeError ? 413 : 400
        });
    }

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

    if (stopId && !journey.stops.some((stop) => stop.stopId === stopId))
    {
        return Response.json({ error: "Signalement invalide" }, { status: 400 });
    }

    if (isJourneyCompleted(journey))
    {
        return Response.json({ error: "Les signalements sont fermés pour cette circulation terminée." }, { status: 409 });
    }

    try
    {
        const report = await createPassengerReport({
            journeyRef,
            stopId,
            type: body.type,
            message
        });
        return Response.json({ report }, { status: 201 });
    }
    catch (error)
    {
        if (error instanceof PassengerReportRateLimitError)
        {
            return Response.json(
            {
                error: "Patientez quelques secondes avant un nouveau signalement."
            },
            {
                status: 429,
                headers: { "Retry-After": String(error.retryAfterSeconds) }
            });
        }

        throw error;
    }
}
