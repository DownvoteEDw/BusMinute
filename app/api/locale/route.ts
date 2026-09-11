import { NextResponse } from "next/server";
import { JsonBodyTooLargeError, readJsonBody } from "../../../src/application/http-json.js";
import { isLocale, localeCookieName } from "../../../src/application/i18n";

export async function POST(request: Request): Promise<Response>
{
    let body: { locale?: unknown } | null;

    try
    {
        body = await readJsonBody(request) as { locale?: unknown } | null;
    }
    catch (error)
    {
        return Response.json(
        {
            error: error instanceof JsonBodyTooLargeError ? "Request too large" : "Unsupported language"
        },
        {
            status: error instanceof JsonBodyTooLargeError ? 413 : 400
        });
    }

    const locale = body?.locale;

    if (!isLocale(locale))
    {
        return Response.json({ error: "Unsupported language" }, { status: 400 });
    }

    const response = NextResponse.json({ locale });
    response.cookies.set(
    {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
        name: localeCookieName,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        value: locale
    });
    return response;
}
