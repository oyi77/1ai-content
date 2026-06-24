-- Ecosystem Integration: Tracking Tables
-- Run this migration on the shared database

-- ══════════════════════════════════════════════════════════════════════
-- Tracking Links (1ai-affiliate)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tracking_links (
    id BIGSERIAL PRIMARY KEY,
    tracking_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    destination_url TEXT NOT NULL,
    campaign_id VARCHAR(255),
    platform VARCHAR(50),
    sub_id VARCHAR(255),
    click_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracking_links_user_id ON tracking_links(user_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_campaign_id ON tracking_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_created_at ON tracking_links(created_at);

-- ══════════════════════════════════════════════════════════════════════
-- Conversions (1ai-affiliate)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversions (
    id BIGSERIAL PRIMARY KEY,
    tracking_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    conversion_type VARCHAR(50) NOT NULL,
    revenue DECIMAL(15, 2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'IDR',
    commission DECIMAL(15, 2) DEFAULT 0,
    campaign_id VARCHAR(255),
    platform VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversions_tracking_id ON conversions(tracking_id);
CREATE INDEX IF NOT EXISTS idx_conversions_user_id ON conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversions_created_at ON conversions(created_at);
CREATE INDEX IF NOT EXISTS idx_conversions_type ON conversions(conversion_type);

-- ══════════════════════════════════════════════════════════════════════
-- Published Posts (1ai-social)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS published_posts (
    id BIGSERIAL PRIMARY KEY,
    content_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    platform_post_id VARCHAR(255),
    post_url TEXT,
    caption TEXT,
    media_url TEXT,
    media_type VARCHAR(20),
    status VARCHAR(50) DEFAULT 'published',
    tracking_id VARCHAR(255),
    scheduled_at TIMESTAMP,
    published_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_published_posts_user_id ON published_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_published_posts_platform ON published_posts(platform);
CREATE INDEX IF NOT EXISTS idx_published_posts_status ON published_posts(status);
CREATE INDEX IF NOT EXISTS idx_published_posts_created_at ON published_posts(created_at);

-- ══════════════════════════════════════════════════════════════════════
-- Facebook Pages (1ai-social)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facebook_pages (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    page_id VARCHAR(255) NOT NULL,
    page_name VARCHAR(255) NOT NULL,
    access_token TEXT,
    category VARCHAR(100),
    fan_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_facebook_pages_user_id ON facebook_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_active ON facebook_pages(is_active);
