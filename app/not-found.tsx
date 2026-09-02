import Link from "next/link";

export default function NotFoundPage()
{
    return (
        <div className="not-found-page">
            <span>404</span>
            <h1>Ce bus a quitté le radar.</h1>
            <p>Le bus demandé n’existe pas ou n’est plus disponible.</p>
            <Link href="/">Revenir à la recherche</Link>
        </div>
    );
}
