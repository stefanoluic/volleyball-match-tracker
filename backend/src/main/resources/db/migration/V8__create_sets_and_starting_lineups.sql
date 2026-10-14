ALTER TABLE volleyball.match_players
    ADD CONSTRAINT match_players_identity_unique UNIQUE (id, match_id, team_id);

CREATE TABLE volleyball.match_sets (
    id UUID PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES volleyball.matches(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL CHECK (set_number BETWEEN 1 AND 5),
    status VARCHAR(20) NOT NULL CHECK (status IN ('LIVE', 'FINISHED')),
    home_score INTEGER NOT NULL DEFAULT 0 CHECK (home_score >= 0),
    away_score INTEGER NOT NULL DEFAULT 0 CHECK (away_score >= 0),
    first_serving_team_id UUID NOT NULL REFERENCES volleyball.teams(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT match_sets_number_unique UNIQUE (match_id, set_number),
    CONSTRAINT match_sets_identity_unique UNIQUE (id, match_id)
);

CREATE TABLE volleyball.set_lineups (
    id UUID PRIMARY KEY,
    set_id UUID NOT NULL,
    match_id UUID NOT NULL,
    team_id UUID NOT NULL,
    match_player_id UUID NOT NULL,
    rotation_position INTEGER NOT NULL CHECK (rotation_position BETWEEN 1 AND 6),
    CONSTRAINT set_lineups_set_fk FOREIGN KEY (set_id, match_id)
        REFERENCES volleyball.match_sets(id, match_id) ON DELETE CASCADE,
    CONSTRAINT set_lineups_participant_fk FOREIGN KEY (match_player_id, match_id, team_id)
        REFERENCES volleyball.match_players(id, match_id, team_id)
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT set_lineups_position_unique UNIQUE (set_id, team_id, rotation_position),
    CONSTRAINT set_lineups_player_unique UNIQUE (set_id, match_player_id)
);

CREATE INDEX set_lineups_participant_idx ON volleyball.set_lineups(match_player_id, match_id, team_id);
