ALTER TABLE volleyball.match_sets
    ADD COLUMN score_version INTEGER NOT NULL DEFAULT 0 CHECK (score_version >= 0),
    ADD COLUMN last_point_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_point_sequence >= 0);

CREATE TABLE volleyball.set_points (
    id UUID PRIMARY KEY,
    set_id UUID NOT NULL REFERENCES volleyball.match_sets(id) ON DELETE CASCADE,
    scoring_team_id UUID NOT NULL REFERENCES volleyball.teams(id) ON DELETE RESTRICT,
    sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
    request_id UUID NOT NULL,
    expected_version INTEGER NOT NULL CHECK (expected_version >= 0),
    home_score_after INTEGER NOT NULL CHECK (home_score_after >= 0),
    away_score_after INTEGER NOT NULL CHECK (away_score_after >= 0),
    created_at TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    undo_request_id UUID,
    undo_expected_version INTEGER CHECK (undo_expected_version >= 0),
    CONSTRAINT set_points_sequence_unique UNIQUE (set_id, sequence_number),
    CONSTRAINT set_points_request_unique UNIQUE (set_id, request_id),
    CONSTRAINT set_points_undo_request_unique UNIQUE (set_id, undo_request_id),
    CONSTRAINT set_points_cancelled_fields CHECK (
        (cancelled_at IS NULL AND undo_request_id IS NULL AND undo_expected_version IS NULL)
        OR (cancelled_at IS NOT NULL AND undo_request_id IS NOT NULL AND undo_expected_version IS NOT NULL)
    )
);

CREATE INDEX set_points_active_idx ON volleyball.set_points(set_id, sequence_number DESC)
    WHERE cancelled_at IS NULL;
