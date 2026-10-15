ALTER TABLE volleyball.match_sets
    ADD COLUMN finished_at TIMESTAMPTZ,
    ADD COLUMN finish_request_id UUID,
    ADD COLUMN finish_expected_version INTEGER CHECK (finish_expected_version >= 0),
    ADD CONSTRAINT match_sets_finish_metadata CHECK (
        (finished_at IS NULL AND finish_request_id IS NULL AND finish_expected_version IS NULL)
        OR (status = 'FINISHED' AND finished_at IS NOT NULL
            AND finish_request_id IS NOT NULL AND finish_expected_version IS NOT NULL)
    );

CREATE UNIQUE INDEX match_sets_one_live_per_match ON volleyball.match_sets(match_id)
    WHERE status = 'LIVE';
