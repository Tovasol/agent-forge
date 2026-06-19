-- Optional D1 fallback CRM store. Used only if Google Sheets isn't configured.
-- Mirrors the scorecard payload written by worker/index.ts.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  company TEXT,
  source TEXT,
  ts INTEGER,
  ua TEXT,
  country TEXT,
  percent INTEGER,                   -- overall reliability score, 0-100
  tier TEXT,                         -- at-risk | fragile | solid
  dimensions TEXT,                   -- JSON: per-dimension percents
  stage TEXT DEFAULT 'new',          -- new | nurturing | qualified | customer | lost
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_tier ON leads(tier);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
