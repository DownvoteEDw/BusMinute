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
        return segment;
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

export function journeyPath(journeyRef: string): string
{
    return `/suivi/${journeyPathSegment(journeyRef)}`;
}
