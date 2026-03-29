# CRM Platform — Setup-Anleitung

## Schnellstart (Lokal)

### 1. Supabase einrichten
1. Geh auf https://supabase.com und erstelle ein neues Projekt
2. Geh zu **SQL Editor** und führe `supabase/schema.sql` aus
3. Kopiere die Keys aus **Settings > API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 2. Environment-Variablen
```bash
cp .env.example .env
```
Fülle die `.env` aus:
- Supabase-Keys (siehe Schritt 1)
- `ANTHROPIC_API_KEY` — dein Claude API Key
- `CREDENTIALS_ENCRYPTION_KEY` — generiere mit: `openssl rand -hex 32`

### 3. Installieren & Starten
```bash
cd platform
npm install
npm run dev
```
App läuft auf http://localhost:3000

### 4. Erster Admin-User
Der **erste User**, der sich registriert, wird automatisch Admin.

---

## Deployment (Docker)

### Option A: Docker Compose
```bash
# .env befüllen (siehe oben)
docker-compose up -d
```

### Option B: Vercel (nur Frontend)
1. Push zu GitHub
2. Auf Vercel importieren
3. Environment-Variablen in Vercel-Dashboard eintragen
4. Playwright-Service separat auf VPS hosten

---

## Architektur

```
┌─────────────────────────────────────────┐
│  Browser (User)                         │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Login   │ │Dashboard │ │  Admin  │ │
│  └────┬─────┘ └────┬─────┘ └────┬────┘ │
└───────┼─────────────┼────────────┼──────┘
        │             │            │
┌───────▼─────────────▼────────────▼──────┐
│  Next.js API Routes                     │
│  ┌──────────┐ ┌────────┐ ┌───────────┐  │
│  │/api/chat │ │/api/   │ │/api/admin │  │
│  │(Anthropic)│ │credent.│ │(User mgmt)│  │
│  └────┬─────┘ └───┬────┘ └─────┬─────┘  │
└───────┼────────────┼────────────┼────────┘
        │            │            │
┌───────▼────────────▼────────────▼────────┐
│  Supabase                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Auth    │ │  DB      │ │ Realtime │  │
│  │ (Users)  │ │(Profiles,│ │(Activity │  │
│  │          │ │ Activit.,│ │  Live)   │  │
│  │          │ │ Chat,    │ │          │  │
│  │          │ │ Creds)   │ │          │  │
│  └──────────┘ └──────────┘ └──────────┘  │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  Playwright Service (Phase 2)            │
│  ┌──────────┐                            │
│  │ Headless │ → crm.job-step.com         │
│  │ Chrome   │                            │
│  └──────────┘                            │
└──────────────────────────────────────────┘
```

## Kosten (geschätzt)

| Service | Free Tier | Bezahlt |
|---------|-----------|---------|
| Supabase | 50k Rows, 500MB, Auth inklusive | ab $25/Mo |
| Vercel | 100GB Bandwidth | ab $20/Mo |
| Anthropic API | — | ~$10-30/Mo |
| VPS (Playwright) | — | ab $5/Mo (Hetzner) |

## Nächste Schritte (Phase 2)

- [ ] Playwright-Service mit echtem CRM-Login
- [ ] Parallele Chrome-Sessions pro User
- [ ] ClickUp-Integration via MCP
- [ ] E-Mail-Benachrichtigungen bei Fehlern
- [ ] Dashboard-Charts mit Recharts
