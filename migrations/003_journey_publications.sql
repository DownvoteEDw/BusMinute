CREATE TABLE journey_publications
(
    public_id text PRIMARY KEY,
    journey_ref text NOT NULL UNIQUE,
    operator_slug text NOT NULL,
    service_number text NOT NULL,
    snapshot jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX journey_publications_service ON journey_publications (operator_slug, service_number);
