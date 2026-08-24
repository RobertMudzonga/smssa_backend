CREATE TABLE IF NOT EXISTS instructions (
    id BIGSERIAL PRIMARY KEY,
    legal_case_id INTEGER REFERENCES legal_cases(case_id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(project_id) ON DELETE CASCADE,
    author_id INTEGER,
    author_role VARCHAR(40) NOT NULL CHECK (author_role IN ('corporate_client', 'internal_admin', 'internal_manager', 'internal_staff')),
    author_name VARCHAR(255),
    message TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT instructions_target_check CHECK (
        (legal_case_id IS NOT NULL AND project_id IS NULL)
        OR
        (legal_case_id IS NULL AND project_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_instructions_legal_case_id_created_at
    ON instructions (legal_case_id, created_at);

CREATE INDEX IF NOT EXISTS idx_instructions_project_id_created_at
    ON instructions (project_id, created_at);
