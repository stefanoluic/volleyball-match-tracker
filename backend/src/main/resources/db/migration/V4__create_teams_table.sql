CREATE TABLE volleyball.teams (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT teams_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT teams_city_not_blank CHECK (length(btrim(city)) > 0)
);

CREATE UNIQUE INDEX teams_name_city_unique
    ON volleyball.teams (lower(name), lower(city));
