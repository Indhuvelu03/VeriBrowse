-- VeriBrowse Core 3.0 Database Schema
-- Optimized for Vector Search (768 Dimensions)

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- 1.5. Users Table (Authentication & Profile)
CREATE TABLE users (
  uid TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  auth_provider TEXT DEFAULT 'firebase',
  credits_used INTEGER DEFAULT 0,
  credits_limit INTEGER DEFAULT 1000,
  total_sessions INTEGER DEFAULT 0,
  total_workflows INTEGER DEFAULT 0,
  preferences JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);

-- 2. History Table
CREATE TABLE history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT REFERENCES users(uid) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  favicon_url TEXT,
  visited_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(768) -- To power semantic history search
);

-- 3. Chat History (Agent Interactions)
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT REFERENCES users(uid) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  role TEXT CHECK (role IN ('user', 'agent')),
  content TEXT NOT NULL,
  workflow_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(768)
);

-- 4. Downloads
CREATE TABLE downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT REFERENCES users(uid) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  saved_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(768)
);

-- 5. Learned Agent Skills (The 'Memory')
CREATE TABLE agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT REFERENCES users(uid) ON DELETE CASCADE,
  domain TEXT NOT NULL, -- e.g. "amazon.com"
  skill_name TEXT NOT NULL, -- e.g. "Add current item to list"
  goal TEXT NOT NULL, -- The original user prompt
  steps JSONB NOT NULL, -- The deterministic Workflow steps JSON
  embedding vector(768), -- Match against user's prompt
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(uid, domain, skill_name)
);

-- 6. Prompt Cache (Budget Protection)
CREATE TABLE prompt_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash TEXT UNIQUE NOT NULL,
  response TEXT NOT NULL,
  model TEXT DEFAULT 'gemini-2.0-flash',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 7. Semantic Search RPC Function
-- This allows us to perform cosine similarity searches directly via Supabase client
CREATE OR REPLACE FUNCTION semantic_search (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  content TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sub.id, 
    sub.source,
    sub.content, 
    1 - (sub.embedding <=> query_embedding) AS similarity
  FROM (
    -- Combine search across multiple tables
    SELECT id, 'history' as source, title as content, embedding FROM history
    UNION ALL
    SELECT id, 'skill' as source, goal as content, embedding FROM agent_skills
    UNION ALL
    SELECT id, 'chat' as source, content as content, embedding FROM chat_history
    UNION ALL
    SELECT id, 'download' as source, filename as content, embedding FROM downloads
  ) AS sub
  WHERE 1 - (sub.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 8. Table Indexes
CREATE INDEX ON users(email);
CREATE INDEX ON users(auth_provider);
CREATE INDEX ON history USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON history(uid);
CREATE INDEX ON agent_skills USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON agent_skills(uid);
CREATE INDEX ON chat_history USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON chat_history(uid);
CREATE INDEX ON chat_history (session_id);
CREATE INDEX ON downloads USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON downloads(uid);
CREATE INDEX ON prompt_cache (expires_at);
