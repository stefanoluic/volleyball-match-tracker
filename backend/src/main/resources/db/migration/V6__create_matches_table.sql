CREATE TABLE volleyball.matches (
    id UUID PRIMARY KEY,
    home_team_id UUID NOT NULL REFERENCES volleyball.teams(id) ON DELETE RESTRICT,
    away_team_id UUID NOT NULL REFERENCES volleyball.teams(id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'LIVE', 'FINISHED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT matches_distinct_teams CHECK (home_team_id <> away_team_id)
);

CREATE INDEX matches_schedule_idx ON volleyball.matches(scheduled_at, id);
CREATE INDEX matches_home_team_idx ON volleyball.matches(home_team_id);
CREATE INDEX matches_away_team_idx ON volleyball.matches(away_team_id);
