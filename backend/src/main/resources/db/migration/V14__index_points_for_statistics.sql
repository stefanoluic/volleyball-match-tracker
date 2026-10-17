CREATE INDEX set_points_statistics_idx ON volleyball.set_points(match_id, set_id)
    WHERE cancelled_at IS NULL;
