CREATE TABLE volleyball.set_substitutions (
    id UUID PRIMARY KEY,
    set_id UUID NOT NULL,
    match_id UUID NOT NULL,
    team_id UUID NOT NULL,
    outgoing_participant_id UUID NOT NULL,
    incoming_participant_id UUID NOT NULL,
    starting_position INTEGER NOT NULL CHECK (starting_position BETWEEN 1 AND 6),
    request_id UUID NOT NULL,
    expected_version INTEGER NOT NULL CHECK (expected_version >= 0),
    after_point_sequence INTEGER NOT NULL CHECK (after_point_sequence >= 0),
    home_score INTEGER NOT NULL CHECK (home_score >= 0),
    away_score INTEGER NOT NULL CHECK (away_score >= 0),
    created_at TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    undo_request_id UUID,
    undo_expected_version INTEGER CHECK (undo_expected_version >= 0),
    CONSTRAINT set_substitutions_set_fk FOREIGN KEY (set_id, match_id)
        REFERENCES volleyball.match_sets(id, match_id) ON DELETE CASCADE,
    CONSTRAINT set_substitutions_outgoing_fk FOREIGN KEY (outgoing_participant_id, match_id, team_id)
        REFERENCES volleyball.match_players(id, match_id, team_id) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT set_substitutions_incoming_fk FOREIGN KEY (incoming_participant_id, match_id, team_id)
        REFERENCES volleyball.match_players(id, match_id, team_id) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT set_substitutions_different_players CHECK (outgoing_participant_id <> incoming_participant_id),
    CONSTRAINT set_substitutions_request_unique UNIQUE (set_id, request_id),
    CONSTRAINT set_substitutions_undo_unique UNIQUE (set_id, undo_request_id),
    CONSTRAINT set_substitutions_version_unique UNIQUE (set_id, expected_version),
    CONSTRAINT set_substitutions_cancelled_fields CHECK (
        (cancelled_at IS NULL AND undo_request_id IS NULL AND undo_expected_version IS NULL)
        OR (cancelled_at IS NOT NULL AND undo_request_id IS NOT NULL AND undo_expected_version IS NOT NULL)
    )
);

CREATE INDEX set_substitutions_active_idx ON volleyball.set_substitutions(set_id, expected_version)
    WHERE cancelled_at IS NULL;
