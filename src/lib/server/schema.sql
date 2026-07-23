-- MikroTik Manager schema (PostgreSQL 14+).
-- Applied by: node scripts/init-db.mjs  (uses pg, splits on ;)

CREATE TABLE IF NOT EXISTS users (
	id            BIGSERIAL PRIMARY KEY,
	email         VARCHAR(255) NOT NULL UNIQUE,
	password_hash VARCHAR(255) NOT NULL,
	role          VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
	id         CHAR(64) PRIMARY KEY,                    -- random token (hex)
	user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Router credentials stored ENCRYPTED (AES-256-GCM) in password_enc.
CREATE TABLE IF NOT EXISTS routers (
	id           BIGSERIAL PRIMARY KEY,
	user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name         VARCHAR(120) NOT NULL,
	host         VARCHAR(255) NOT NULL,
	transport    VARCHAR(4) NOT NULL CHECK (transport IN ('rest','api')),  -- rest=v7, api=binary v6
	port         INTEGER,                                -- null => transport default
	use_tls      BOOLEAN NOT NULL DEFAULT false,
	username     VARCHAR(120) NOT NULL,
	password_enc TEXT NOT NULL,                          -- encrypted at rest
	created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routers_user ON routers(user_id);

-- Per-user AI provider config (9router). API key encrypted at rest.
CREATE TABLE IF NOT EXISTS ai_settings (
	user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	base_url     VARCHAR(255) NOT NULL,
	api_key_enc  TEXT NOT NULL,
	active_model VARCHAR(160),
	updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
	id         BIGSERIAL PRIMARY KEY,
	user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	router_id  BIGINT REFERENCES routers(id) ON DELETE SET NULL,   -- chat scoped to a router (nullable)
	title      VARCHAR(200),
	memory_summary TEXT,
	memory_through_message_id BIGINT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS memory_summary TEXT;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS memory_through_message_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_user_router ON chat_sessions(user_id, router_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
	id           BIGSERIAL PRIMARY KEY,
	session_id   BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
	role         VARCHAR(10) NOT NULL CHECK (role IN ('system','user','assistant','tool')),
	content      TEXT NOT NULL,
	tool_calls   JSONB,                                  -- assistant tool-call requests
	tool_call_id VARCHAR(80),
	name         VARCHAR(120),
	created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_session ON chat_messages(session_id);

-- Image attachments are private files served through an authenticated endpoint.
CREATE TABLE IF NOT EXISTS chat_message_attachments (
	id           BIGSERIAL PRIMARY KEY,
	message_id   BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
	filename     VARCHAR(200) NOT NULL,
	mime_type    VARCHAR(40) NOT NULL,
	size_bytes   INTEGER NOT NULL,
	storage_path TEXT NOT NULL,
	created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_attachment_message ON chat_message_attachments(message_id);

-- RouterOS skill docs (tikoci) for RAG. Embeddings are 384-dim (MiniLM),
-- stored as JSONB array; cosine similarity computed app-side.
CREATE TABLE IF NOT EXISTS skill_docs (
	id         BIGSERIAL PRIMARY KEY,
	source     VARCHAR(255) NOT NULL,                   -- file/path in tikoci repo
	title      VARCHAR(300),
	content    TEXT NOT NULL,
	embedding  JSONB NOT NULL,                          -- number[384]
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Keyword fallback search over title+content.
CREATE INDEX IF NOT EXISTS idx_skill_fts ON skill_docs
	USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || content));
