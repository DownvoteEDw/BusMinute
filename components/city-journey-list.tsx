"use client";

import { useState } from "react";
import { localize, type Locale } from "../src/application/i18n";
import type { CityJourneyPageView, JourneyView } from "../src/application/journey-view";
import { journeyStopInCity } from "../src/application/station-schedule";
import { JourneyCard } from "./journey-card";

interface CityJourneyListProps
{
    citySlug: string;
    serviceDate: string;
    initialPage: CityJourneyPageView;
    locale?: Locale;
}

export function CityJourneyList(
{
    citySlug,
    serviceDate,
    initialPage,
    locale = "fr"
}: CityJourneyListProps)
{
    const [journeys, setJourneys] = useState(initialPage.journeys);
    const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function loadMore(): Promise<void>
    {
        if (!nextCursor || loading)
        {
            return;
        }

        setLoading(true);
        setError(null);

        try
        {
            const parameters = new URLSearchParams({
                date: serviceDate,
                cursor: nextCursor,
                limit: "20"
            });
            const response = await fetch(`/api/cities/${encodeURIComponent(citySlug)}/journeys?${parameters}`, {
                cache: "no-store"
            });

            if (!response.ok)
            {
                setError(localize(locale, "Impossible de charger les trajets suivants.", "Unable to load more buses.", "No se han podido cargar más trayectos."));
                return;
            }

            const page = await response.json() as CityJourneyPageView;
            setJourneys((current) => mergeJourneys(current, page.journeys));
            setNextCursor(page.nextCursor);
        }
        catch
        {
            setError(localize(locale, "Impossible de charger les trajets suivants.", "Unable to load more buses.", "No se han podido cargar más trayectos."));
        }
        finally
        {
            setLoading(false);
        }
    }

    if (journeys.length === 0)
    {
        return (
            <div className="empty-state">
                <h2>{localize(locale, "Aucun passage disponible pour cette date", "No services available on this date", "No hay servicios disponibles para esta fecha")}</h2>
                <p>{localize(locale, "Les prochains horaires apparaîtront automatiquement.", "Upcoming times will appear automatically.", "Los próximos horarios aparecerán automáticamente.")}</p>
            </div>
        );
    }

    return (
        <>
            <div className="journey-list">
                {journeys.map((journey) =>
                {
                    const stopId = journeyStopInCity(journey, citySlug)?.stopId;
                    return <JourneyCard eventStopId={stopId} journey={journey} key={journey.journeyRef} locale={locale} />;
                })}
            </div>
            {nextCursor && (
                <div className="journey-load-more">
                    <button disabled={loading} onClick={() => void loadMore()} type="button">
                        {loading
                            ? localize(locale, "Chargement…", "Loading…", "Cargando…")
                            : localize(locale, "Voir plus de trajets", "Show more buses", "Ver más trayectos")}
                    </button>
                    <span>{localize(
                        locale,
                        `${journeys.length} sur ${initialPage.totalCount} passages affichés`,
                        `${journeys.length} of ${initialPage.totalCount} services shown`,
                        `${journeys.length} de ${initialPage.totalCount} servicios mostrados`
                    )}</span>
                </div>
            )}
            {error && <p className="journey-load-error" role="alert">{error}</p>}
        </>
    );
}

function mergeJourneys(current: JourneyView[], additional: JourneyView[]): JourneyView[]
{
    const journeys = new Map(current.map((journey) => [journey.journeyRef, journey]));

    for (const journey of additional)
    {
        journeys.set(journey.journeyRef, journey);
    }

    return [...journeys.values()];
}
