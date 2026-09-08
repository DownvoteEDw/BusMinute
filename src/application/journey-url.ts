export function journeyPathSegment(journeyRef: string): string
{
    const encoded = encodeURIComponent(journeyRef);

    if (!/[#/%?;\\~\u0000-\u001f\u007f]/.test(journeyRef))
    {
        return encoded;
    }

    return `j~${encoded.replaceAll("~", "~7E").replace(/%([0-9A-F]{2})/g, "~$1")}`;
}

export function journeyRefFromPath(segment: string): string | null
{
    if (!segment.startsWith("j~"))
    {
        try
        {
            return decodeURIComponent(segment);
        }
        catch
        {
            return null;
        }
    }

    try
    {
        return decodeURIComponent(segment.slice(2).replace(/~([0-9A-F]{2})/g, "%$1"));
    }
    catch
    {
        return null;
    }
}

export function journeyPath(journey: string | { journeyRef: string; publicPath?: string }): string
{
    if (typeof journey !== "string" && journey.publicPath)
    {
        return journey.publicPath;
    }

    const journeyRef = typeof journey === "string" ? journey : journey.journeyRef;
    return `/suivi/${journeyPathSegment(journeyRef)}`;
}

export function busServicePath(journey: { operatorSlug: string; serviceNumber: string }): string
{
    return `/bus/${journey.operatorSlug}/${journeyPathSegment(journey.serviceNumber)}`;
}

export function cityRoutePath(originSlug: string, destinationSlug: string): string
{
    return `/trajets/${encodeURIComponent(originSlug)}/${encodeURIComponent(destinationSlug)}`;
}

export function publicJourneyId(segment: string): string | null
{
    return /^\d{4}-\d{2}-\d{2}-([a-f0-9]{20})$/.exec(segment)?.[1] ?? null;
}
