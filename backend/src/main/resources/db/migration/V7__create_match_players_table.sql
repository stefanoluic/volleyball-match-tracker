ALTER TABLE volleyball.matches
    ADD COLUMN roster_version INTEGER NOT NULL DEFAULT 0 CHECK (roster_version >= 0);

CREATE TABLE volleyball.match_players (
    id UUID PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES volleyball.matches(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES volleyball.players(id) ON DELETE RESTRICT,
    team_id UUID NOT NULL REFERENCES volleyball.teams(id) ON DELETE RESTRICT,
    first_name VARCHAR(100) NOT NULL CHECK (length(btrim(first_name)) > 0),
    last_name VARCHAR(100) NOT NULL CHECK (length(btrim(last_name)) > 0),
    jersey_number INTEGER NOT NULL CHECK (jersey_number BETWEEN 1 AND 99),
    position VARCHAR(30) NOT NULL CHECK (
        position IN ('SETTER', 'OUTSIDE_HITTER', 'OPPOSITE', 'MIDDLE_BLOCKER', 'LIBERO')
    ),
    is_libero BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT match_players_match_player_unique UNIQUE (match_id, player_id),
    CONSTRAINT match_players_team_jersey_unique UNIQUE (match_id, team_id, jersey_number)
);

CREATE INDEX match_players_player_idx ON volleyball.match_players(player_id);
CREATE INDEX match_players_team_idx ON volleyball.match_players(team_id);
