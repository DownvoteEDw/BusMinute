"use client";

import { useRouter } from "next/navigation";
import { journeyPath } from "../src/application/journey-url";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { countLabel, localize, type Locale } from "../src/application/i18n";
import type { JourneyView, PlaceSearchResultView } from "../src/application/journey-view";
import { trackAnalyticsEvent } from "./analytics";

interface SearchBoxProps
{
    initialQuery?: string;
    compact?: boolean;
    locale?: Locale;
}

export function SearchBox({ initialQuery = "", compact = false, locale = "fr" }: SearchBoxProps)
{
    const router = useRouter();
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<JourneyView[]>([]);
    const [places, setPlaces] = useState<PlaceSearchResultView[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const requestNumber = useRef(0);

    useEffect(() =>
    {
        const normalized = query.trim();

        if (normalized.length < 2)
        {
            setResults([]);
            setPlaces([]);
            setOpen(false);
            return;
        }

        const controller = new AbortController();
        const currentRequest = requestNumber.current + 1;
        requestNumber.current = currentRequest;
        const timeout = window.setTimeout(async () =>
        {
            setLoading(true);

            try
            {
                const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`,
                {
                    cache: "no-store",
                    signal: controller.signal
                });
                const data = await response.json() as
                {
                    journeys?: JourneyView[];
                    places?: PlaceSearchResultView[];
                };

                if (currentRequest === requestNumber.current)
                {
                    setResults(data.journeys ?? []);
                    setPlaces(data.places ?? []);
                    setOpen(true);
                }
            }
            catch (error)
            {
                if (!(error instanceof DOMException && error.name === "AbortError"))
                {
                    setResults([]);
                    setPlaces([]);
                }
            }
            finally
            {
                if (currentRequest === requestNumber.current)
                {
                    setLoading(false);
                }
            }
        }, 220);

        return () =>
        {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [query]);

    function submit(event: FormEvent<HTMLFormElement>): void
    {
        event.preventDefault();
        const firstPlace = places[0];
        const first = results[0];

        if (firstPlace)
        {
            trackSearchSuccess(firstPlace.type === "stop" ? "station" : "city", "submit");
            router.push(firstPlace.href);
            return;
        }

        if (first)
        {
            trackSearchSuccess("journey", "submit");
            router.push(journeyPath(first));
            return;
        }

        if (query.trim().length >= 2)
        {
            router.push(`/recherche?q=${encodeURIComponent(query.trim())}`);
        }
    }

    function choose(journey: JourneyView): void
    {
        setOpen(false);
        trackSearchSuccess("journey", "suggestion");
        router.push(journeyPath(journey));
    }

    function choosePlace(place: PlaceSearchResultView): void
    {
        setOpen(false);
        trackSearchSuccess(place.type === "stop" ? "station" : "city", "suggestion");
        router.push(place.href);
    }

    return (
        <div className={`search-shell ${compact ? "is-compact" : ""}`}>
            <form className="search-box" onSubmit={submit} role="search">
                <label htmlFor={compact ? "service-number-compact" : "service-number"}>{localize(locale, "Numéro, ville ou trajet", "Bus number, city or route", "Número, ciudad o ruta")}</label>
                <div>
                    <input
                        autoComplete="off"
                        id={compact ? "service-number-compact" : "service-number"}
                        name="q"
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={() => setOpen(results.length > 0 || places.length > 0)}
                        placeholder={localize(locale, "Ex. 50819 ou Paris → Tours", "E.g. 50819 or Paris → Tours", "Ej. 50819 o París → Tours")}
                        value={query}
                    />
                    <button type="submit">{loading ? localize(locale, "Recherche…", "Searching…", "Buscando…") : localize(locale, "Rechercher", "Search", "Buscar")}</button>
                </div>
            </form>
            {open && (
                <div className="search-results" role="listbox" aria-label={localize(locale, "Résultats de recherche", "Search results", "Resultados de búsqueda")}>
                    {places.length === 0 && results.length === 0 ? (
                        <p>{localize(
                            locale,
                            "Aucun bus trouvé aujourd’hui. Essayez une ville, un numéro ou un trajet comme Paris → Tours.",
                            "No buses found today. Try a city, bus number or route such as Paris → Tours.",
                            "No hemos encontrado autobuses para hoy. Prueba con una ciudad, un número o una ruta como París → Tours."
                        )}</p>
                    ) : (
                        <>
                            {places.map((place) =>
                            {
                                return (
                                    <button key={`${place.type}-${place.id}`} onClick={() => choosePlace(place)} role="option">
                                        <span><b>{place.label}</b><small>{placeDetail(place, locale)}</small></span>
                                        <span className="place-result-type">{place.type === "city" ? localize(locale, "Ville", "City", "Ciudad") : localize(locale, "Gare", "Station", "Estación")}</span>
                                    </button>
                                );
                            })}
                            {results.map((journey) =>
                            {
                                return (
                                    <button key={journey.journeyRef} onClick={() => choose(journey)} role="option">
                                        <span><b>{journey.operatorName} · Bus {journey.serviceNumber}</b><small>{journey.originCity} → {journey.destinationCity}</small></span>
                                        <span className={`result-delay ${delayClass(journey.delaySeconds)}`}>{formatDelay(journey, locale)}</span>
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function trackSearchSuccess(resultType: "journey" | "city" | "station", source: "submit" | "suggestion"): void
{
    trackAnalyticsEvent("search-success",
    {
        resultType,
        source
    });
}

function formatDelay(journey: JourneyView, locale: Locale): string
{
    const seconds = journey.delaySeconds;

    if (seconds === null)
    {
        return journey.realtimeObserved
            ? localize(locale, "À venir", "Upcoming", "Próximo")
            : localize(locale, "Horaire prévu", "Scheduled", "Horario previsto");
    }

    const minutes = Math.round(seconds / 60);

    if (minutes === 0)
    {
        return localize(locale, "À l'heure", "On time", "Puntual");
    }

    return minutes > 0 ? `+${minutes} min` : `${minutes} min`;
}

function placeDetail(place: PlaceSearchResultView, locale: Locale): string
{
    if (locale === "fr" || place.type !== "city")
    {
        return place.detail;
    }

    const count = Number.parseInt(place.detail, 10);
    return Number.isFinite(count)
        ? countLabel(locale, count, "gare", "gares", "station", "stations", "estación", "estaciones")
        : place.detail;
}

function delayClass(seconds: number | null): string
{
    if (seconds === null || Math.abs(seconds) < 300)
    {
        return "on-time";
    }

    return seconds > 0 ? "late" : "early";
}
