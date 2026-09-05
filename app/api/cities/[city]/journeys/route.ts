import { transitDataService } from "../../../../../src/application/transit-data-service.js";

interface RouteProps
{
    params: Promise<{ city: string }>;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteProps): Promise<Response>
{
    const { city } = await params;
    const searchParams = new URL(request.url).searchParams;
    const serviceDate = searchParams.get("date")?.trim() ?? "";
    const cursor = searchParams.get("cursor")?.trim() || null;
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "20", 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)
        || Number.isNaN(new Date(`${serviceDate}T12:00:00Z`).getTime()))
    {
        return Response.json({ error: "Date invalide" }, { status: 400 });
    }

    try
    {
        const page = await transitDataService.getCityJourneyPage(
            city,
            serviceDate,
            cursor,
            Number.isFinite(requestedLimit) ? requestedLimit : 20
        );

        if (!page)
        {
            return Response.json({ error: "Ville introuvable" }, { status: 404 });
        }

        return Response.json(page,
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
            error: "Les trajets sont momentanément indisponibles."
        },
        {
            status: 503,
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    }
}
