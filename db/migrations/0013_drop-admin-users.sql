-- Alte NextAuth-Tabelle entfernen; der Login läuft über Supabase
-- (bisher scripts/migrate-drop-admin-users.ts)
DROP TABLE IF EXISTS admin_users;
