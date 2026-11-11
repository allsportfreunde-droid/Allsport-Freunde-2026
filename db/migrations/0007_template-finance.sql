-- Finanzen in Vorlagen (bisher scripts/migrate-template-finance.ts)
ALTER TABLE event_templates ADD COLUMN IF NOT EXISTS entry_price DECIMAL(10,2);

CREATE TABLE IF NOT EXISTS template_costs (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_template_costs_template_id ON template_costs(template_id);
