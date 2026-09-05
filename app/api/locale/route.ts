import { NextResponse } from "next/server";
import { isLocale, localeCookieName } from "../../../src/application/i18n";

export async function POST(request: Request): Promise<Response>
{
    const body = await request.json().catch(() => null) as { locale?: unknown } | null;

    if (!isLocale(body?.locale))
    {
        return Response.json({ error: "Unsupported language" }, { status: 400 });
    }

    const response = NextResponse.json({ locale: body.locale });
    response.cookies.set(
    {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365,
        name: localeCookieName,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        value: body.locale
    });
    return response;
}
