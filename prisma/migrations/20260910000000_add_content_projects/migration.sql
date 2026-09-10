-- CreateTable
CREATE TABLE IF NOT EXISTS "content_projects" (
    "id" BIGSERIAL PRIMARY KEY,
    "source_url" VARCHAR(512) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "workflow" VARCHAR(64) NOT NULL DEFAULT '',
    "file_path" VARCHAR(512),
    "status" VARCHAR(16) NOT NULL DEFAULT 'created',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
