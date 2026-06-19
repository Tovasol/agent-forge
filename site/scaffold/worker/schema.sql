-- Optional D1 fallback CRM store. Used only if Google Sheets isn't configured.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  source TEXT,
  ts INTEGER,
  ua TEXT,
  country TEXT,
  stage TEXT DEFAULT 'new',          -- new | nurturing | qualified | customer | lost
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
