import { cookies } from "next/headers";
import { localeCookieName, normalizeLocale, type Locale } from "../src/application/i18n";

export async function requestLocale(): Promise<Locale>
{
    const cookieStore = await cookies();
    return normalizeLocale(cookieStore.get(localeCookieName)?.value);
}
