"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { JourneyApproximatePosition, JourneyVehiclePosition, MapCoordinates } from "../src/application/journey-map";
import { localize, type Locale } from "../src/application/i18n";
import type { JourneyStopPhase } from "../src/application/journey-view";

interface MapStop extends MapCoordinates
{
    id: string;
    name: string;
    label: string;
    phase: JourneyStopPhase;
}

interface JourneyMapCanvasProps
{
    positions: JourneyVehiclePosition[];
    approximatePosition: JourneyApproximatePosition | null;
    stops: MapStop[];
    locale: Locale;
    styleUrl?: string;
    serviceNumber: string;
    operatorName: string;
}

const defaultStyleUrl = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
maplibregl.setWorkerUrl(`/maplibre/${maplibregl.getVersion()}/maplibre-gl-worker.mjs`);

export default function JourneyMapCanvas(props: JourneyMapCanvasProps)
{
    const container = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markers = useRef(new Map<string, maplibregl.Marker>());
    const latest = useRef(props);
    latest.current = props;
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [overview, setOverview] = useState(true);
    const following = useRef(false);
    const { approximatePosition, locale, positions, stops, styleUrl } = props;

    useEffect(() =>
    {
        if (!container.current)
        {
            return;
        }

        let instance: maplibregl.Map;
        let disposed = false;
        setReady(false);
        setFailed(false);
        try
        {
            const initial = latest.current;
            const first = initial.stops[0] ?? initial.positions[0] ?? initial.approximatePosition;
            instance = new maplibregl.Map({
                container: container.current,
                style: styleUrl || defaultStyleUrl,
                center: first ? [first.longitude, first.latitude] : [0, 0],
                zoom: 7,
                minZoom: 2,
                maxZoom: 18,
                attributionControl: false,
                scrollZoom: false,
                dragRotate: false,
                pitchWithRotate: false,
                touchPitch: false,
                locale: {
                    "NavigationControl.ZoomIn": localize(locale, "Zoomer", "Zoom in", "Acercar"),
                    "NavigationControl.ZoomOut": localize(locale, "Dézoomer", "Zoom out", "Alejar"),
                    "Popup.Close": localize(locale, "Fermer", "Close", "Cerrar"),
                    "AttributionControl.ToggleAttribution": localize(locale, "Sources de la carte", "Map attribution", "Fuentes del mapa")
                }
            });
        }
        catch
        {
            setFailed(true);
            return;
        }

        map.current = instance;
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        instance.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
        const timeout = window.setTimeout(() =>
        {
            if (!disposed)
            {
                setFailed(true);
            }
        }, 20_000);
        instance.on("load", () =>
        {
            if (disposed)
            {
                return;
            }
            window.clearTimeout(timeout);
            setReady(true);
            setFailed(false);
            const current = latest.current;
            fitMap(instance, current.stops.length > 0 ? current.stops : current.positions);
        });
        instance.on("error", () =>
        {
            if (!disposed && !instance.isStyleLoaded())
            {
                setFailed(true);
            }
        });
        instance.on("dragstart", () =>
        {
            following.current = false;
            setOverview(true);
        });
        instance.on("moveend", () => placeStopLabels(instance));
        instance.on("idle", () => placeApproximateVehicle(instance, markers.current.get("vehicle-approximate"), latest.current.approximatePosition));
        const observer = new ResizeObserver(() =>
        {
            instance.resize();
            window.requestAnimationFrame(() => placeStopLabels(instance));
        });
        observer.observe(container.current);

        return () =>
        {
            disposed = true;
            observer.disconnect();
            window.clearTimeout(timeout);
            markers.current.forEach((marker) => marker.remove());
            markers.current.clear();
            map.current = null;
            instance.remove();
        };
    }, [styleUrl, locale, attempt]);

    useEffect(() =>
    {
        const instance = map.current;
        if (!instance || !ready)
        {
            return;
        }

        const activeIds = new Set<string>();
        for (const [index, stop] of stops.entries())
        {
            const id = `stop-${stop.id}`;
            activeIds.add(id);
            let marker = markers.current.get(id);
            if (!marker)
            {
                const button = document.createElement("button");
                button.type = "button";
                const label = document.createElement("span");
                label.className = "journey-map-stop-label";
                label.dataset.placement = String(index % 8);
                label.ariaHidden = "true";
                label.textContent = stop.label;
                button.append(label);
                marker = new maplibregl.Marker({ element: button })
                    .setLngLat([stop.longitude, stop.latitude])
                    .setPopup(new maplibregl.Popup({ offset: 12 }).setText(stop.name))
                    .addTo(instance);
                markers.current.set(id, marker);
            }
            const element = marker.getElement();
            element.classList.add("journey-map-stop");
            for (const phase of ["passed", "current", "upcoming"])
            {
                element.classList.toggle(phase, stop.phase === phase);
            }
            element.setAttribute("aria-label", stop.name);
            const label = element.querySelector<HTMLElement>(".journey-map-stop-label");
            if (label)
            {
                label.textContent = stop.label;
            }
            marker.setLngLat([stop.longitude, stop.latitude]);
            updatePopup(marker, stop.name);
        }
        for (const position of positions)
        {
            const id = `vehicle-${position.id}`;
            activeIds.add(id);
            let marker = markers.current.get(id);
            if (!marker)
            {
                const button = document.createElement("button");
                button.type = "button";
                const icon = document.createElement("img");
                icon.src = "/icons/bus-map.svg";
                icon.alt = "";
                icon.width = 22;
                icon.height = 22;
                button.append(icon);
                marker = new maplibregl.Marker({ element: button })
                    .setLngLat([position.longitude, position.latitude])
                    .setPopup(new maplibregl.Popup({ offset: 22 }))
                    .addTo(instance);
                markers.current.set(id, marker);
            }
            const element = marker.getElement();
            element.classList.add("journey-map-vehicle");
            element.classList.toggle("is-stale", position.lastKnown === true);
            const label = localize(locale, `Bus ${props.serviceNumber} · ${props.operatorName}`, `Bus ${props.serviceNumber} · ${props.operatorName}`, `Autobús ${props.serviceNumber} · ${props.operatorName}`);
            element.setAttribute("aria-label", label);
            const description = position.lastKnown
                ? localize(locale, "Dernière position connue", "Last known position", "Última posición conocida")
                : localize(locale, "Position transmise par le transporteur", "Position provided by the operator", "Posición facilitada por el operador");
            marker.setLngLat([position.longitude, position.latitude]);
            updatePopup(marker, `${label} · ${description}`);
        }
        if (approximatePosition && positions.length === 0)
        {
            const id = "vehicle-approximate";
            activeIds.add(id);
            let marker = markers.current.get(id);
            if (!marker)
            {
                const button = document.createElement("button");
                button.type = "button";
                const icon = document.createElement("img");
                icon.src = "/icons/bus-map.svg";
                icon.alt = "";
                icon.width = 22;
                icon.height = 22;
                button.append(icon);
                marker = new maplibregl.Marker({ element: button })
                    .setLngLat([approximatePosition.longitude, approximatePosition.latitude])
                    .setPopup(new maplibregl.Popup({ offset: 22 }))
                    .addTo(instance);
                markers.current.set(id, marker);
            }
            const element = marker.getElement();
            element.classList.add("journey-map-vehicle", "is-approximate");
            const label = localize(locale, `Position approximative du bus ${props.serviceNumber}`, `Approximate location of bus ${props.serviceNumber}`, `Ubicación aproximada del autobús ${props.serviceNumber}`);
            const description = localize(
                locale,
                `Position exacte indisponible · entre ${approximatePosition.fromName} et ${approximatePosition.toName}`,
                `Exact location unavailable · between ${approximatePosition.fromName} and ${approximatePosition.toName}`,
                `Ubicación exacta no disponible · entre ${approximatePosition.fromName} y ${approximatePosition.toName}`
            );
            element.setAttribute("aria-label", label);
            updatePopup(marker, `${label} · ${description}`);
            placeApproximateVehicle(instance, marker, approximatePosition);
        }
        for (const [id, marker] of markers.current)
        {
            if (!activeIds.has(id))
            {
                marker.remove();
                markers.current.delete(id);
            }
        }
        if (following.current && !overview && positions.length === 1)
        {
            instance.jumpTo({ center: [positions[0]!.longitude, positions[0]!.latitude] });
        }
        window.requestAnimationFrame(() => placeStopLabels(instance));
    }, [approximatePosition, positions, stops, ready, overview, locale, props.serviceNumber, props.operatorName]);

    function changeView(): void
    {
        const instance = map.current;
        if (!instance)
        {
            return;
        }

        const showOverview = !overview;
        setOverview(showOverview);
        following.current = !showOverview;
        if (showOverview)
        {
            fitMap(instance, stops.length > 0 ? stops : positions);
        }
        else if (positions.length === 1)
        {
            instance.jumpTo({ center: [positions[0]!.longitude, positions[0]!.latitude], zoom: 10 });
        }
        else
        {
            fitMap(instance, positions);
        }
    }

    return (
        <div className="journey-map-content">
            <div className="journey-map-surface">
                <div className="journey-map-canvas" ref={container} aria-label={localize(locale, "Carte routière du trajet", "Journey road map", "Mapa del trayecto")} />
                {!ready && !failed && <div className="journey-map-message" role="status">{localize(locale, "Chargement de la carte…", "Loading map…", "Cargando mapa…")}</div>}
                {failed && <div className="journey-map-message" role="status">
                    <span>{localize(locale, "La carte n’est pas disponible pour le moment.", "The map is currently unavailable.", "El mapa no está disponible en este momento.")}</span>
                    <button type="button" onClick={() => setAttempt((value) => value + 1)}>{localize(locale, "Réessayer", "Try again", "Reintentar")}</button>
                </div>}
            </div>
            {ready && !failed && positions.length > 0 && <div className="journey-map-toolbar">
                <button type="button" onClick={changeView}>{overview
                    ? localize(locale, "Recentrer sur le bus", "Center on the bus", "Centrar en el autobús")
                    : localize(locale, "Voir tout le trajet", "View entire journey", "Ver todo el trayecto")}</button>
            </div>}
        </div>
    );
}

function updatePopup(marker: maplibregl.Marker, text: string): void
{
    const element = marker.getElement();
    if (element.dataset.popupText !== text)
    {
        marker.getPopup()?.setText(text);
        element.dataset.popupText = text;
    }
}

function placeApproximateVehicle(map: maplibregl.Map, marker: maplibregl.Marker | undefined, position: JourneyApproximatePosition | null): void
{
    if (!marker || !position || !map.isStyleLoaded())
    {
        return;
    }

    const center = map.project([position.longitude, position.latitude]);
    const radius = 90;
    const roadLayers = map.getStyle().layers
        .filter((layer) => layer.type === "line" && /road|transport|street|motorway|highway|bridge|tunnel/i.test(layer.id))
        .map((layer) => layer.id);
    if (roadLayers.length === 0)
    {
        marker.setLngLat([position.longitude, position.latitude]);
        return;
    }

    const features = map.queryRenderedFeatures([
        [center.x - radius, center.y - radius],
        [center.x + radius, center.y + radius]
    ], { layers: roadLayers });
    let nearest: { x: number; y: number } | null = null;
    let nearestDistance = radius * radius;

    for (const feature of features)
    {
        const geometry = feature.geometry as { type: string; coordinates: unknown };
        const lines = geometry.type === "LineString"
            ? [geometry.coordinates as number[][]]
            : geometry.type === "MultiLineString"
                ? geometry.coordinates as number[][][]
                : [];
        for (const line of lines)
        {
            for (let index = 1; index < line.length; index += 1)
            {
                const startCoordinates = line[index - 1];
                const endCoordinates = line[index];
                if (!startCoordinates || !endCoordinates)
                {
                    continue;
                }
                const start = map.project([startCoordinates[0]!, startCoordinates[1]!]);
                const end = map.project([endCoordinates[0]!, endCoordinates[1]!]);
                const candidate = closestPoint(center, start, end);
                const distance = squaredDistance(center, candidate);
                if (distance < nearestDistance)
                {
                    nearest = candidate;
                    nearestDistance = distance;
                }
            }
        }
    }

    if (nearest)
    {
        marker.setLngLat(map.unproject([nearest.x, nearest.y]));
    }
    else
    {
        marker.setLngLat([position.longitude, position.latitude]);
    }
}

function closestPoint(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number }
{
    const x = end.x - start.x;
    const y = end.y - start.y;
    const length = x * x + y * y;
    const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * x + (point.y - start.y) * y) / length));
    return { x: start.x + x * ratio, y: start.y + y * ratio };
}

function squaredDistance(first: { x: number; y: number }, second: { x: number; y: number }): number
{
    return (first.x - second.x) ** 2 + (first.y - second.y) ** 2;
}

function fitMap(map: maplibregl.Map, points: MapCoordinates[]): void
{
    if (points.length === 0)
    {
        return;
    }
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
    const narrow = map.getContainer().clientWidth < 500;
    map.fitBounds(bounds, {
        padding: narrow
            ? { top: 40, right: 38, bottom: 40, left: 38 }
            : { top: 48, right: 55, bottom: 48, left: 55 },
        maxZoom: 10,
        duration: 0
    });
}

function placeStopLabels(map: maplibregl.Map): void
{
    const mapBounds = map.getContainer().getBoundingClientRect();
    const markerBounds = [...map.getContainer().querySelectorAll<HTMLElement>(".journey-map-stop, .journey-map-vehicle")]
        .map((element) => element.getBoundingClientRect());
    const labels = [...map.getContainer().querySelectorAll<HTMLElement>(".journey-map-stop-label")];
    const occupied = [...markerBounds];

    labels.forEach((label, index) =>
    {
        const placementCount = map.getContainer().clientWidth < 500 ? 22 : 8;
        let bestPlacement = 0;
        let bestScore = Infinity;
        for (let offset = 0; offset < placementCount; offset += 1)
        {
            const placement = (index * 3 + offset) % placementCount;
            label.dataset.placement = String(placement);
            const bounds = label.getBoundingClientRect();
            const score = placementScore(bounds, mapBounds, occupied);
            if (score < bestScore)
            {
                bestPlacement = placement;
                bestScore = score;
            }
            if (score === 0)
            {
                break;
            }
        }
        label.dataset.placement = String(bestPlacement);
        occupied.push(label.getBoundingClientRect());
    });
}

function placementScore(bounds: DOMRect, mapBounds: DOMRect, occupied: DOMRect[]): number
{
    const outside = Math.max(0, mapBounds.left + 4 - bounds.left)
        + Math.max(0, bounds.right - mapBounds.right + 4)
        + Math.max(0, mapBounds.top + 4 - bounds.top)
        + Math.max(0, bounds.bottom - mapBounds.bottom + 4);
    return outside * 10_000 + occupied.reduce((score, other) =>
    {
        const width = Math.max(0, Math.min(bounds.right, other.right + 3) - Math.max(bounds.left, other.left - 3));
        const height = Math.max(0, Math.min(bounds.bottom, other.bottom + 3) - Math.max(bounds.top, other.top - 3));
        return score + width * height;
    }, 0);
}
