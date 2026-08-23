CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS operators
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    source_timezone text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stops
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES operators(id),
    external_id text NOT NULL,
    code text,
    name text NOT NULL,
    description text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    timezone text,
    wheelchair_boarding smallint,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (operator_id, external_id)
);

CREATE TABLE IF NOT EXISTS routes
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES operators(id),
    external_id text NOT NULL,
    short_name text NOT NULL,
    long_name text NOT NULL,
    route_type integer NOT NULL,
    color text,
    text_color text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (operator_id, external_id)
);

CREATE TABLE IF NOT EXISTS service_calendars
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES operators(id),
    external_id text NOT NULL,
    monday boolean NOT NULL,
    tuesday boolean NOT NULL,
    wednesday boolean NOT NULL,
    thursday boolean NOT NULL,
    friday boolean NOT NULL,
    saturday boolean NOT NULL,
    sunday boolean NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (operator_id, external_id)
);

CREATE TABLE IF NOT EXISTS service_calendar_dates
(
    service_calendar_id uuid NOT NULL REFERENCES service_calendars(id) ON DELETE CASCADE,
    service_date date NOT NULL,
    exception_type smallint NOT NULL CHECK (exception_type IN (1, 2)),
    PRIMARY KEY (service_calendar_id, service_date)
);

CREATE TABLE IF NOT EXISTS scheduled_trips
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES operators(id),
    route_id uuid NOT NULL REFERENCES routes(id),
    service_calendar_id uuid NOT NULL REFERENCES service_calendars(id),
    external_trip_id text NOT NULL,
    service_number text NOT NULL,
    headsign text,
    wheelchair_accessible smallint,
    bikes_allowed smallint,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (operator_id, external_trip_id)
);

CREATE INDEX IF NOT EXISTS scheduled_trips_service_number_idx
    ON scheduled_trips (operator_id, service_number);

CREATE TABLE IF NOT EXISTS scheduled_stop_times
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_trip_id uuid NOT NULL REFERENCES scheduled_trips(id) ON DELETE CASCADE,
    stop_id uuid NOT NULL REFERENCES stops(id),
    stop_sequence integer NOT NULL,
    arrival_seconds integer NOT NULL,
    departure_seconds integer NOT NULL,
    pickup_type smallint,
    drop_off_type smallint,
    UNIQUE (scheduled_trip_id, stop_sequence)
);

CREATE TABLE IF NOT EXISTS trip_instances
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    operator_id uuid NOT NULL REFERENCES operators(id),
    scheduled_trip_id uuid REFERENCES scheduled_trips(id),
    service_number text NOT NULL,
    service_date date NOT NULL,
    siri_journey_ref text NOT NULL,
    status text NOT NULL DEFAULT 'UNKNOWN',
    current_delay_seconds integer,
    scheduled_departure_at timestamptz,
    scheduled_arrival_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (operator_id, siri_journey_ref)
);

CREATE INDEX IF NOT EXISTS trip_instances_public_search_idx
    ON trip_instances (operator_id, service_number, service_date);

CREATE TABLE IF NOT EXISTS trip_stop_realtime
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_instance_id uuid NOT NULL REFERENCES trip_instances(id) ON DELETE CASCADE,
    stop_id uuid NOT NULL REFERENCES stops(id),
    stop_sequence integer NOT NULL,
    aimed_arrival_at timestamptz,
    expected_arrival_at timestamptz,
    actual_arrival_at timestamptz,
    aimed_departure_at timestamptz,
    expected_departure_at timestamptz,
    actual_departure_at timestamptz,
    arrival_status text,
    departure_status text,
    cancelled boolean NOT NULL DEFAULT false,
    extra_call boolean NOT NULL DEFAULT false,
    source_updated_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trip_instance_id, stop_sequence)
);

CREATE TABLE IF NOT EXISTS trip_source_matches
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_instance_id uuid NOT NULL REFERENCES trip_instances(id) ON DELETE CASCADE,
    source text NOT NULL,
    source_reference text NOT NULL,
    match_method text NOT NULL,
    confidence numeric(5, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    score_details jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (trip_instance_id, source, source_reference)
);

CREATE TABLE IF NOT EXISTS provider_fetches
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES operators(id),
    source text NOT NULL,
    fetched_at timestamptz NOT NULL,
    http_status integer NOT NULL,
    payload jsonb,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS provider_fetches_expiration_idx
    ON provider_fetches (expires_at);

CREATE TABLE IF NOT EXISTS passenger_reports
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_ref text NOT NULL,
    stop_external_id text,
    report_type text NOT NULL CHECK
    (
        report_type IN
        (
            'BUS_NOT_HERE',
            'BUS_ARRIVED',
            'BOARDING',
            'BUS_DEPARTED',
            'PLATFORM_CHANGED',
            'DRIVER_DELAY'
        )
    ),
    message text,
    anonymous_fingerprint text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (char_length(message) <= 280)
);

CREATE INDEX IF NOT EXISTS passenger_reports_journey_idx
    ON passenger_reports (journey_ref, created_at DESC);
