"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { localeTag, localize, type Locale } from "../src/application/i18n";
import type { JourneyView } from "../src/application/journey-view";
import { approximateVehiclePosition, isVehiclePositionStale, mapCoordinates, vehiclePositionTime, visibleVehiclePositions } from "../src/application/journey-map";

const JourneyMapCanvas = dynamic(() => import("./journey-map-canvas"), { ssr: false });

interface JourneyMapProps
{
    journey: JourneyView;
    locale: Locale;
    completed: boolean;
    refreshFailed: boolean;
    styleUrl?: string;
}

export function JourneyMap({ journey, locale, completed, refreshFailed, styleUrl }: JourneyMapProps)
{
    const [now, setNow] = useState<number | null>(null);
    const [open, setOpen] = useState(!completed && !journey.cancelled
        && ((journey.vehiclePositions?.length ?? 0) > 0 || (journey.status === "in_transit" && journey.realtimeObserved)));
    const [inView, setInView] = useState(false);
    const [element, setElement] = useState<HTMLDivElement | null>(null);

    useEffect(() =>
    {
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() =>
    {
        if (!element || inView)
        {
            return;
        }

        if (!("IntersectionObserver" in window))
        {
            setInView(true);
            return;
        }

        const observer = new IntersectionObserver(([entry]) =>
        {
            if (entry?.isIntersecting)
            {
                setInView(true);
                observer.disconnect();
            }
        }, { rootMargin: "200px" });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element, inView]);

    const positions = now === null ? [] : visibleVehiclePositions(journey, now, completed);
    const stops = journey.stops.flatMap((stop) =>
    {
        const location = mapCoordinates(stop.location?.latitude, stop.location?.longitude);
        return location ? [{ ...location, id: `${stop.stopId}-${stop.order}`, name: stop.name, label: mapStopLabel(stop.city), phase: stop.phase }] : [];
    });
    const stale = refreshFailed || positions.some((position) => isVehiclePositionStale(position, now ?? 0));
    const hasPositions = positions.length > 0;
    const approximatePosition = hasPositions ? null : approximateVehiclePosition(journey, completed);
    const hasApproximatePosition = approximatePosition !== null;
    const positionAt = positions.reduce((oldest, position) => Math.min(oldest, vehiclePositionTime(position)), Infinity);
    const sourceTimestamp = hasPositions && positions.every((position) => Boolean(position.recordedAt));
    const title = hasPositions
        ? stale
            ? localize(locale, "Dernière position connue", "Last known position", "Última posición conocida")
            : localize(locale, "Position du bus", "Bus location", "Ubicación del autobús")
        : hasApproximatePosition
            ? localize(locale, "Position approximative du bus", "Approximate bus location", "Ubicación aproximada del autobús")
            : localize(locale, "Arrêts sur la carte", "Stops on the map", "Paradas en el mapa");

    if (stops.length === 0 && !hasPositions)
    {
        return null;
    }

    return (
        <div className="journey-map" ref={setElement}>
            <button type="button" className="journey-map-summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                <span className="journey-map-label">{title}</span>
                {hasPositions && <span className="journey-map-age">{receivedLabel(positionAt, now ?? positionAt, locale, sourceTimestamp)}</span>}
                <span className="journey-map-disclosure" aria-hidden="true">{open ? localize(locale, "Masquer ↑", "Hide ↑", "Ocultar ↑") : localize(locale, "Afficher ↓", "Show ↓", "Mostrar ↓")}</span>
            </button>
            {open && <>
                {inView && now !== null ? <JourneyMapCanvas
                    key={journey.journeyRef}
                    positions={positions.map((position) => ({ ...position, lastKnown: refreshFailed || isVehiclePositionStale(position, now) }))}
                    approximatePosition={approximatePosition}
                    stops={stops}
                    locale={locale}
                    styleUrl={styleUrl}
                    serviceNumber={journey.serviceNumber}
                    operatorName={journey.operatorName}
                /> : <div className="journey-map-placeholder" role="status">{localize(locale, "Chargement de la carte…", "Loading map…", "Cargando mapa…")}</div>}
                <p className="journey-map-caption" role="status">
                    {hasPositions
                        ? stale
                            ? localize(locale, "La position du bus n’a pas été actualisée récemment.", "The bus location has not been updated recently.", "La ubicación del autobús no se ha actualizado recientemente.")
                            : localize(locale, `Dernière position transmise par ${journey.operatorName}.`, `Last position provided by ${journey.operatorName}.`, `Última posición facilitada por ${journey.operatorName}.`)
                        : hasApproximatePosition
                            ? localize(
                                locale,
                                `Position exacte indisponible · bus situé entre ${approximatePosition.fromName} et ${approximatePosition.toName}.`,
                                `Exact location unavailable · bus located between ${approximatePosition.fromName} and ${approximatePosition.toName}.`,
                                `Ubicación exacta no disponible · autobús situado entre ${approximatePosition.fromName} y ${approximatePosition.toName}.`
                            )
                            : completed
                            ? localize(locale, "Les arrêts de ce trajet sont affichés.", "The stops for this journey are shown.", "Se muestran las paradas de este trayecto.")
                            : localize(locale, "La position du bus n’est pas disponible pour ce trajet.", "The bus location is not available for this journey.", "La ubicación del autobús no está disponible para este trayecto.")}
                </p>
            </>}
        </div>
    );
}

function mapStopLabel(value: string): string
{
    return value
        .replace(/\s+(?:central\s+)?bus station$/i, "")
        .replace(/\s+airport bus terminal$/i, "")
        .replace(/\s+bus terminal$/i, "")
        .trim() || value;
}

function receivedLabel(receivedAt: number, now: number, locale: Locale, sourceTimestamp: boolean): string
{
    const seconds = Math.max(0, Math.floor((now - receivedAt) / 1000));
    const relative = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: "always" }).format(
        seconds < 60 ? -seconds : -Math.floor(seconds / 60),
        seconds < 60 ? "second" : "minute"
    );
    return sourceTimestamp
        ? localize(locale, `Actualisée ${relative}`, `Updated ${relative}`, `Actualizada ${relative}`)
        : localize(locale, `Reçue ${relative}`, `Received ${relative}`, `Recibida ${relative}`);
}
