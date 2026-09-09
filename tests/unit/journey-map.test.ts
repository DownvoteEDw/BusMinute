import { describe, expect, it } from "vitest";
import { approximateVehiclePosition, isVehiclePositionStale, journeyVehicleProgress, mapCoordinates, retainLastVehiclePositions, visibleVehiclePositions } from "../../src/application/journey-map.js";
import type { JourneyView } from "../../src/application/journey-view.js";

const now = Date.parse("2026-09-09T12:00:00Z");

function journey(): JourneyView
{
    return {
        journeyRef: "alsa:3235:2026-09-09",
        serviceNumber: "3235",
        serviceDate: "2026-09-09",
        operatorSlug: "alsa",
        operatorName: "Alsa",
        realtimeAvailable: true,
        realtimeObserved: true,
        realtimeStatus: "live",
        originStopId: "madrid",
        originName: "Madrid",
        originCity: "Madrid",
        destinationStopId: "bilbao",
        destinationName: "Bilbao",
        destinationCity: "Bilbao",
        status: "in_transit",
        delaySeconds: 600,
        updatedAt: new Date(now).toISOString(),
        cancelled: false,
        completeStopSequence: true,
        matchConfidence: 1,
        matchMethod: "ALSA_TRACKING_BUS_API",
        scheduledTripId: "3235",
        punctuality: null,
        stops: [],
        vehiclePositions: [{ id: "alsa-1", latitude: 42.34, longitude: -3.70, receivedAt: new Date(now).toISOString() }]
    };
}

describe("position du bus sur la carte", () =>
{
    it("écarte les positions absentes, invalides et le zéro utilisé comme absence de GPS", () =>
    {
        for (const [latitude, longitude] of [[0, 0], [91, 2], [42, -181], [NaN, 2], [42, Infinity], [null, 2], [undefined, 2], ["", 2]])
        {
            expect(mapCoordinates(latitude, longitude)).toBeNull();
        }
        expect(mapCoordinates(0, 2)).toEqual({ latitude: 0, longitude: 2 });
        expect(mapCoordinates(42, 0)).toEqual({ latitude: 42, longitude: 0 });
    });

    it("vieillit indépendamment des horaires et masque les positions trop anciennes", () =>
    {
        const value = journey();
        expect(isVehiclePositionStale(value.vehiclePositions![0]!, now + 121_000)).toBe(true);
        expect(visibleVehiclePositions(value, now + 121_000, false)).toHaveLength(1);
        expect(visibleVehiclePositions(value, now + 30 * 60_000 + 1, false)).toEqual([]);
        expect(visibleVehiclePositions({ ...value, updatedAt: new Date(now + 60 * 60_000).toISOString() }, now + 60 * 60_000, false)).toEqual([]);
    });

    it("conserve une dernière position en cas de réponse sans GPS sans rajeunir sa réception", () =>
    {
        const previous = journey();
        const next = { ...previous, updatedAt: new Date(now + 60_000).toISOString(), vehiclePositions: [] };
        const retained = retainLastVehiclePositions(previous, next);
        expect(retained.updatedAt).toBe(next.updatedAt);
        expect(retained.vehiclePositions).toEqual([{ ...previous.vehiclePositions![0], lastKnown: true }]);
        expect(isVehiclePositionStale(retained.vehiclePositions![0]!, now + 60_000)).toBe(true);
        expect(previous.vehiclePositions![0]?.lastKnown).toBeUndefined();
        expect(retainLastVehiclePositions(retained, previous).vehiclePositions).toEqual(previous.vehiclePositions);
    });

    it("ne reporte jamais un véhicule sur un autre trajet ou une période hors suivi", () =>
    {
        const previous = journey();
        const next = { ...previous, journeyRef: "another", vehiclePositions: [] };
        expect(retainLastVehiclePositions(previous, next).vehiclePositions).toEqual([]);
        expect(retainLastVehiclePositions(previous, { ...next, journeyRef: previous.journeyRef, realtimeStatus: "outside_tracking_period" }).vehiclePositions).toEqual([]);
        expect(retainLastVehiclePositions(previous, { ...next, journeyRef: previous.journeyRef, realtimeStatus: "not_offered" }).vehiclePositions).toEqual([]);
        expect(visibleVehiclePositions({ ...previous, realtimeStatus: "outside_tracking_period" }, now, false)).toEqual([]);
        expect(visibleVehiclePositions({ ...previous, realtimeStatus: "not_offered" }, now, false)).toEqual([]);
    });

    it("utilise l’heure GPS fournie même lorsque la réponse du transporteur vient d’arriver", () =>
    {
        const value = journey();
        value.vehiclePositions![0]!.recordedAt = new Date(now - 5 * 60_000).toISOString();
        expect(isVehiclePositionStale(value.vehiclePositions![0]!, now)).toBe(true);
        value.vehiclePositions![0]!.recordedAt = new Date(now - 31 * 60_000).toISOString();
        expect(visibleVehiclePositions(value, now, false)).toEqual([]);
    });

    it("retire les véhicules des trajets terminés ou annulés et accepte les anciennes publications", () =>
    {
        const value = journey();
        expect(visibleVehiclePositions(value, now, true)).toEqual([]);
        expect(visibleVehiclePositions({ ...value, status: "arrived" }, now, false)).toEqual([]);
        expect(visibleVehiclePositions({ ...value, cancelled: true }, now, false)).toEqual([]);
        expect(visibleVehiclePositions({ ...value, vehiclePositions: undefined }, now, false)).toEqual([]);
        expect(visibleVehiclePositions({ ...value, vehiclePositions: [{ ...value.vehiclePositions![0]!, receivedAt: "invalid" }] }, now, false)).toEqual([]);
        expect(visibleVehiclePositions(value, now - 120_000, false)).toEqual([]);
    });

    it("situe approximativement le bus entre le dernier arrêt passé et le prochain arrêt", () =>
    {
        const value = journey();
        value.vehiclePositions = [];
        value.stops = [
            {
                stopId: "madrid",
                name: "Madrid",
                city: "Madrid",
                order: 1,
                phase: "passed",
                location: { latitude: 40.4168, longitude: -3.7038 },
                aimedArrivalAt: null,
                expectedArrivalAt: null,
                actualArrivalAt: null,
                aimedDepartureAt: null,
                expectedDepartureAt: null,
                actualDepartureAt: null,
                arrivalStatus: null,
                departureStatus: null,
                delaySeconds: 600,
                cancelled: false
            },
            {
                stopId: "burgos",
                name: "Burgos",
                city: "Burgos",
                order: 2,
                phase: "current",
                location: { latitude: 42.3439, longitude: -3.6969 },
                aimedArrivalAt: null,
                expectedArrivalAt: null,
                actualArrivalAt: null,
                aimedDepartureAt: null,
                expectedDepartureAt: null,
                actualDepartureAt: null,
                arrivalStatus: null,
                departureStatus: null,
                delaySeconds: 600,
                cancelled: false
            }
        ];

        const approximate = approximateVehiclePosition(value, false);
        expect(approximate).toMatchObject({
            fromName: "Madrid",
            toName: "Burgos"
        });
        expect(approximate?.latitude).toBeCloseTo(41.38035);
        expect(approximate?.longitude).toBeCloseTo(-3.70035);
        expect(journeyVehicleProgress(value, now, false)).toEqual({
            afterStopIndex: 0,
            progress: .5,
            approximate: true
        });
        value.vehiclePositions = [{
            id: "alsa-1",
            latitude: 40.898575,
            longitude: -3.702075,
            receivedAt: new Date(now).toISOString()
        }];
        const locatedProgress = journeyVehicleProgress(value, now, false);
        expect(locatedProgress).toMatchObject({
            afterStopIndex: 0,
            approximate: false
        });
        expect(locatedProgress?.progress).toBeCloseTo(.25);
        expect(approximateVehiclePosition({ ...value, realtimeObserved: false }, false)).toBeNull();
        expect(approximateVehiclePosition({ ...value, status: "scheduled" }, false)).toBeNull();
        expect(approximateVehiclePosition(value, true)).toBeNull();
    });
});
