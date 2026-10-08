ALTER TABLE volleyball.users DROP CONSTRAINT users_status_valid;
ALTER TABLE volleyball.users ADD CONSTRAINT users_status_valid
    CHECK (status IN ('PENDING', 'ACTIVE', 'BLOCKED', 'REJECTED'));
