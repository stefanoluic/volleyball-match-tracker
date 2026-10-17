ALTER TABLE volleyball.set_points
    ADD COLUMN match_id UUID,
    ADD COLUMN action_type VARCHAR(30) NOT NULL DEFAULT 'UNSPECIFIED',
    ADD COLUMN participant_id UUID,
    ADD COLUMN participant_team_id UUID;

UPDATE volleyball.set_points p SET match_id = s.match_id
    FROM volleyball.match_sets s WHERE p.set_id = s.id;

ALTER TABLE volleyball.set_points
    ALTER COLUMN match_id SET NOT NULL,
    ADD CONSTRAINT set_points_match_fk FOREIGN KEY (set_id, match_id)
        REFERENCES volleyball.match_sets(id, match_id) ON DELETE CASCADE,
    ADD CONSTRAINT set_points_participant_fk FOREIGN KEY (participant_id, match_id, participant_team_id)
        REFERENCES volleyball.match_players(id, match_id, team_id) DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT set_points_action_type CHECK
        (action_type IN ('UNSPECIFIED', 'ATTACK', 'BLOCK', 'SERVICE_ACE', 'OPPONENT_ERROR')),
    ADD CONSTRAINT set_points_participant_fields CHECK
        ((participant_id IS NULL AND participant_team_id IS NULL)
         OR (participant_id IS NOT NULL AND participant_team_id IS NOT NULL)),
    ADD CONSTRAINT set_points_action_participant CHECK
        ((action_type = 'UNSPECIFIED' AND participant_id IS NULL)
         OR (action_type = 'OPPONENT_ERROR' AND
             (participant_id IS NULL OR participant_team_id <> scoring_team_id))
         OR (action_type IN ('ATTACK', 'BLOCK', 'SERVICE_ACE') AND
             participant_id IS NOT NULL AND participant_team_id = scoring_team_id));
