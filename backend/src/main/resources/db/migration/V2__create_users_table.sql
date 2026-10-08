CREATE TABLE volleyball.users (
    id UUID PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
    CONSTRAINT users_role_valid CHECK (role IN ('ADMIN', 'STATISTICIAN', 'COACH')),
    CONSTRAINT users_status_valid CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED')),
    CONSTRAINT users_first_name_not_blank CHECK (length(btrim(first_name)) > 0),
    CONSTRAINT users_last_name_not_blank CHECK (length(btrim(last_name)) > 0)
);
