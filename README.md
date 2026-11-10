# Allsport Freunde 2026 e.V.

Moderner Onepager für den gemeinnützigen Sportverein **Allsport Freunde 2026 e.V.** in der Rhein-Main-Region.

## Tech-Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **shadcn/ui** (manuell integriert)
- **Neon Postgres** (@neondatabase/serverless)
- **Framer Motion** für Animationen
- **Supabase Auth** (Magic Link) für die Admin-Authentifizierung
- **Lucide React** für Icons

## Lokale Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev
```

Die App läuft dann unter [http://localhost:3000](http://localhost:3000).

**Ohne Datenbank:** Wenn keine `POSTGRES_URL` gesetzt ist, verwendet die App automatisch In-Memory-Daten mit Beispiel-Events. So kannst du lokal ohne Datenbank-Setup entwickeln.

**Mit Datenbank:** Wenn du lokal mit einer echten Postgres-DB arbeiten möchtest, erstelle eine `.env.local` mit den Postgres-Zugangsdaten (siehe `.env.example`).

## Deployment auf Vercel

1. **Code auf GitHub pushen**

2. **Vercel-Projekt erstellen:** Auf [vercel.com](https://vercel.com) → „Add New Project" → dein GitHub-Repo auswählen

3. **Postgres-Datenbank erstellen:** Im Vercel-Dashboard → Storage → „Create Database" → Postgres wählen → mit dem Projekt verbinden

4. **Env-Variablen lokal ziehen:**
   ```bash
   npx vercel env pull .env.local
   ```

5. **Tabellen erstellen:**
   ```bash
   npx tsx scripts/setup-db.ts
   ```

6. **Seed-Daten einfügen:**
   ```bash
   npx tsx scripts/seed.ts
   ```

7. **Supabase-Variablen setzen:** `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` im Vercel-Dashboard hinterlegen (siehe Abschnitt „Supabase Setup").

8. **Bei Upgrade von NextAuth:** Alte `admin_users`-Tabelle entfernen:
   ```bash
   npm run db:migrate-drop-admin-users
   ```

9. **Deployen:** `git push` – Vercel baut automatisch

10. **Cron-Job aktivieren (Erinnerungsmails):**
   - Erzeuge ein sicheres Secret: `openssl rand -base64 32`
   - Vercel-Dashboard → Project Settings → Environment Variables → `CRON_SECRET` setzen
   - Der Job läuft täglich um 08:00 UTC (09:00 MEZ / 10:00 MESZ) und sendet Erinnerungsmails an alle bestätigten Teilnehmer, deren Event am nächsten Tag stattfindet
   - Logs: Vercel-Dashboard → Logs → Cron

## Admin-Bereich

Der Admin-Bereich ist unter `/admin` erreichbar und durch **Supabase Magic Link Login** geschützt – kein Passwort, sondern ein Login-Link per E-Mail.

### Login-Flow

1. `/login` öffnen (außerhalb von `/admin`, daher ohne Auth erreichbar)
2. E-Mail-Adresse eintragen → „Magic Link senden"
3. Link aus der E-Mail anklicken → Supabase tauscht den Code via `/auth/callback` gegen eine Session und redirectet zu `/admin`
4. Abmelden via Sidebar-Button (Server Action, kein Client-State)

Schutzschichten:
- **Middleware** (`middleware.ts`): redirectet unauthentifizierte Requests auf `/admin/*` zu `/login` und gibt für `/api/admin/*` `401 Unauthorized` zurück
- **Server-Component-Check** in `app/admin/layout.tsx` als zweite Absicherung (`supabase.auth.getUser()`)

### Supabase Setup

1. Projekt auf [supabase.com](https://supabase.com) anlegen (Free Tier reicht)
2. **Project Settings → API**: `Project URL` und `anon public key` kopieren
3. Werte als Environment Variables setzen (lokal in `.env.local`, in Production in Vercel):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. **Authentication → URL Configuration**:
   - `Site URL`: `https://deine-domain.de` (in Production) bzw. `http://localhost:3000` (lokal)
   - `Redirect URLs`: zusätzlich `https://deine-domain.de/auth/callback` (bzw. `http://localhost:3000/auth/callback`) eintragen
5. **Authentication → Providers**: „Email" aktivieren, „Confirm email" anlassen (Magic Link funktioniert ohne weitere Konfiguration)
6. **Authentication → Users**: berechtigte Admin-E-Mail-Adressen manuell als User anlegen (alternativ via Invite-Flow)

Funktionen:
- **Dashboard** mit Statistiken und letzten Anmeldungen
- **Event-Verwaltung** – Erstellen, Bearbeiten, Löschen mit Filter und Suche
- **Anmeldungs-Verwaltung** – Übersicht, Filterung, CSV-Export, Löschen
- Responsive Sidebar-Navigation

## Features

- Responsiver Onepager mit Hero, Über uns, Events, FAQ und Footer
- Event-Anmeldung mit Formular-Validierung
- Kategorie-Filter (Fußball, Fitness, Schwimmen)
- Plätze-Fortschrittsbalken mit Ausgebucht-Status
- Duplikat-Prüfung bei Anmeldungen
- Smooth Scrolling und dezente Scroll-Animationen
- Komplett auf Deutsch
- Admin-Bereich mit Magic-Link-Login, Dashboard, Event- und Anmeldungsverwaltung

## Event-Reviews

Im Check-in-Dashboard wird die Review-Anfrage ab dem Event-Tag im Tab „Review“ manuell an eingecheckte Anmeldungen mit E-Mail versendet; später Eingecheckte können per „Nachsenden“ erreicht werden.
Teilnehmer bewerten über den Link in der E-Mail und können ihre Antworten innerhalb von 14 Tagen ändern.
Unter Admin → Reviews gibt der Vorstand Kommentare mit Einwilligung für die Homepage frei und kann die Freigabe jederzeit zurücknehmen.

Migration vor dem Deployment auf der jeweiligen Datenbank ausführen:

```bash
npm run db:migrate-reviews
```

Reviews benötigen eine Postgres-Datenbank (`POSTGRES_URL`). Für den E-Mail-Versand müssen `RESEND_API_KEY` und `NEXT_PUBLIC_APP_URL` gesetzt sein: Ohne API-Schlüssel werden E-Mails nur protokolliert und als versendet gezählt; ohne `NEXT_PUBLIC_APP_URL` zeigen die Links in den E-Mails auf `http://localhost:3000`.

## API-Endpunkte

### Öffentlich
- `GET /api/events` – Alle kommenden Events mit Teilnehmerzahlen
- `POST /api/registrations` – Neue Anmeldung erstellen

### Auth (Supabase)
- `GET /auth/callback` – Tauscht den Magic-Link-Code gegen eine Session und redirectet zu `/admin`

### Cron (Bearer CRON_SECRET)
- `GET /api/cron/send-reminders` – Erinnerungsmails versenden (täglich 08:00 UTC via Vercel Cron)

### Admin (geschützt)
- `GET /api/admin/stats` – Dashboard-Statistiken
- `GET/POST /api/admin/events` – Events auflisten / erstellen
- `GET/PUT/DELETE /api/admin/events/[id]` – Event lesen / bearbeiten / löschen
- `GET /api/admin/events/[id]/registrations` – Anmeldungen pro Event
- `GET /api/admin/registrations` – Alle Anmeldungen
- `DELETE /api/admin/registrations/[id]` – Anmeldung löschen
- `GET /api/admin/registrations/export` – CSV-Export

## Projektstruktur

```
/app
  /api/events/route.ts        # Events API
  /api/registrations/route.ts  # Anmeldungen API
  layout.tsx                   # Root Layout
  page.tsx                     # Hauptseite
  globals.css                  # Globale Styles
/components
  /ui/                         # shadcn/ui Komponenten
  Hero.tsx                     # Hero-Bereich
  AboutUs.tsx                  # Über uns Sektion
  EventCard.tsx                # Event-Karte
  EventGrid.tsx                # Event-Grid mit Filter
  RegistrationModal.tsx        # Anmelde-Dialog
  GeneralInfo.tsx              # FAQ-Bereich
  Footer.tsx                   # Footer mit Kontakt
/app
  /admin
    layout.tsx                   # Server Component: prüft Supabase-Session, rendert AdminShell
    page.tsx                     # Dashboard
    /actions/auth.ts             # Logout Server Action
    /events/page.tsx             # Event-Übersicht
    /events/new/page.tsx         # Neues Event
    /events/[id]/edit/page.tsx   # Event bearbeiten
    /events/[id]/registrations/  # Anmeldungen pro Event
    /registrations/page.tsx      # Alle Anmeldungen
  /login/page.tsx                # Magic-Link-Login (außerhalb /admin)
  /auth/callback/route.ts        # Tauscht Code gegen Session
  /api/admin/                    # Geschützte Admin-API-Routes (Middleware + getUser())
/components/admin
  AdminShell.tsx                 # Client-Wrapper: Sidebar + Toast Provider
  Sidebar.tsx                    # Sidebar-Navigation, Logout via Server Action
  StatsCards.tsx                 # Dashboard-Statistiken
  EventForm.tsx                  # Event-Formular
  EventTable.tsx                 # Event-Tabelle mit Filter
  RegistrationTable.tsx          # Anmeldungs-Tabelle
  RecentRegistrations.tsx        # Letzte Anmeldungen
/lib
  /supabase
    client.ts                    # Browser-Client (Client Components)
    server.ts                    # Server-Client (Server Components, Route Handlers)
    middleware.ts                # Session-Refresh + Redirect-Logik
  db.ts                          # Datenbank-Abstraktionsschicht
  local-data.ts                  # In-Memory-Fallback für lokale Entwicklung
  types.ts                       # TypeScript Typen
  utils.ts                       # Hilfsfunktionen
middleware.ts                    # Schützt /admin/* (Redirect) und /api/admin/* (401)
/scripts
  setup-db.ts                    # Erstellt Tabellen
  migrate-drop-admin-users.ts    # Entfernt die alte NextAuth admin_users Tabelle
  seed.ts                        # Fügt Beispiel-Events ein
```
