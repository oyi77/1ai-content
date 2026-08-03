-- =====================================================================
-- BERKAHKARYA AI VIDEO STUDIO - Enhanced Video System Migration
-- Phase 1: Multi-provider, niche/style, prompt cache, analytics
-- =====================================================================

-- Provider health monitoring
CREATE TABLE IF NOT EXISTS provider_health (
  provider VARCHAR(50) PRIMARY KEY,
  status VARCHAR(20) DEFAULT 'healthy',
  last_success TIMESTAMP,
  last_failure TIMESTAMP,
  failure_count INTEGER DEFAULT 0,
  avg_response_time INTEGER,
  circuit_breaker_state VARCHAR(10) DEFAULT 'closed',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced video jobs: add missing columns if not exists
ALTER TABLE videos ADD COLUMN IF NOT EXISTS niche VARCHAR(50);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS styles TEXT[];
ALTER TABLE videos ADD COLUMN IF NOT EXISTS storyboard JSONB;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS provider_chain TEXT[];
ALTER TABLE videos ADD COLUMN IF NOT EXISTS optimized_prompts JSONB;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS product_analysis JSONB;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS generation_metadata JSONB;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS final_provider VARCHAR(50);

-- Prompt cache for AI optimization (24h TTL)
CREATE TABLE IF NOT EXISTS prompt_cache (
  id SERIAL PRIMARY KEY,
  prompt_hash VARCHAR(32) UNIQUE,
  raw_prompt TEXT,
  provider VARCHAR(50),
  style_key VARCHAR(100),
  optimized_prompt TEXT,
  token_estimate INTEGER,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompt_cache_hash ON prompt_cache(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_prompt_cache_expires ON prompt_cache(expires_at);

-- Generation analytics
CREATE TABLE IF NOT EXISTS generation_analytics (
  id SERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  job_id VARCHAR(255),
  niche VARCHAR(50),
  styles TEXT[],
  provider_used VARCHAR(50),
  fallback_count INTEGER DEFAULT 0,
  optimization_used BOOLEAN,
  generation_time_ms INTEGER,
  scene_count INTEGER,
  duration INTEGER,
  credits_used DECIMAL(3,1),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_user ON generation_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_niche ON generation_analytics(niche);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON generation_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_videos_niche ON videos(niche);
