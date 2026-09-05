import Link from "next/link";
import { localize } from "../src/application/i18n";
import { requestLocale } from "./request-locale";

export default async function NotFoundPage()
{
    const locale = await requestLocale();

    return (
        <div className="not-found-page">
            <span>404</span>
            <h1>{localize(locale, "Ce bus a quitté le radar.", "This bus has left the radar.")}</h1>
            <p>{localize(locale, "Le bus demandé n’existe pas ou n’est plus disponible.", "The requested bus does not exist or is no longer available.")}</p>
            <Link href="/">{localize(locale, "Revenir à la recherche", "Back to search")}</Link>
        </div>
    );
}
