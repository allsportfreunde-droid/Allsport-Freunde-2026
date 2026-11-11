-- Kontaktformular mit Gesprächsverlauf (bisher scripts/migrate-contact.ts)
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  whatsapp_number VARCHAR(50),
  message TEXT NOT NULL,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'resolved')),
  conversation_token VARCHAR(255) UNIQUE NOT NULL,
  consent_to_store BOOLEAN NOT NULL DEFAULT FALSE,
  delete_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_token ON contact_inquiries(conversation_token);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email ON contact_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status ON contact_inquiries(status);

-- Alle Nachrichten des Verlaufs: erste Nachricht des Nutzers, Antworten des
-- Teams und Rückfragen. Die erste Nachricht steht zusätzlich hier (sender='user').
CREATE TABLE IF NOT EXISTS inquiry_messages (
  id SERIAL PRIMARY KEY,
  inquiry_id INTEGER NOT NULL REFERENCES contact_inquiries(id) ON DELETE CASCADE,
  sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'admin')),
  message TEXT NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inquiry_messages_inquiry_id ON inquiry_messages(inquiry_id);
