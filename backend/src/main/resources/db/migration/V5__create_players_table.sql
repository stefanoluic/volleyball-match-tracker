CREATE TABLE volleyball.players (
    id UUID PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL CHECK (length(btrim(first_name)) > 0),
    last_name VARCHAR(100) NOT NULL CHECK (length(btrim(last_name)) > 0),
    jersey_number INTEGER NOT NULL CHECK (jersey_number BETWEEN 1 AND 99),
    position VARCHAR(30) NOT NULL CHECK (
        position IN ('SETTER', 'OUTSIDE_HITTER', 'OPPOSITE', 'MIDDLE_BLOCKER', 'LIBERO')
    ),
    team_id UUID NOT NULL REFERENCES volleyball.teams(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT players_team_jersey_unique UNIQUE (team_id, jersey_number)
);
