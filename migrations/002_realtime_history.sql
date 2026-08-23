ALTER TABLE trip_instances
    ADD COLUMN IF NOT EXISTS complete_stop_sequence boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS trip_instances_recent_idx
    ON trip_instances (operator_id, source_updated_at DESC);

CREATE INDEX IF NOT EXISTS stops_name_search_idx
    ON stops (operator_id, lower(name));

CREATE TABLE IF NOT EXISTS trip_stop_observations
(
    id bigserial PRIMARY KEY,
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
    UNIQUE (trip_instance_id, stop_sequence, source_updated_at)
);

CREATE INDEX IF NOT EXISTS trip_stop_observations_history_idx
    ON trip_stop_observations (trip_instance_id, stop_sequence, source_updated_at DESC);

CREATE INDEX IF NOT EXISTS trip_stop_observations_retention_idx
    ON trip_stop_observations (received_at);

CREATE TABLE IF NOT EXISTS data_sync_runs
(
    id bigserial PRIMARY KEY,
    operator_id uuid REFERENCES operators(id),
    source text NOT NULL,
    status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    source_timestamp timestamptz,
    item_count integer,
    error_message text
);

CREATE INDEX IF NOT EXISTS data_sync_runs_latest_idx
    ON data_sync_runs (source, started_at DESC);
