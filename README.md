# WhatsApp Business AI Agent (Hebrew) 🤖💬

A complete WhatsApp Business AI agent system with a small admin app and analytics dashboard.

The agent answers customer questions from a configurable knowledge base, runs predefined
question flows, collects leads, sends links (booking / payment / catalog / support), and
hands off to a human when needed. It works **mainly in Hebrew**.

```
whatsapp/
├── backend/     Node + Express + Prisma + SQLite (local file) + OpenAI (WhatsApp Cloud API)
├── frontend/    React + Vite + Tailwind + Recharts (admin app)
└── docker-compose.yml   Optional: PostgreSQL (only if you switch off SQLite)
```

> **Database:** ships with **SQLite** — a single local file at `backend/prisma/dev.db`.
> No Docker, no server, no internet needed. To use PostgreSQL instead, set the
> `datasource` provider to `postgresql` in `backend/prisma/schema.prisma`, point
> `DATABASE_URL` at your Postgres, and you can drop the JSON bridge in `src/lib/prisma.js`.

## Features

- **WhatsApp AI Agent** – receives messages via WhatsApp Cloud API webhook, replies automatically.
- **Intent classification** – `general_question`, `pricing_question`, `booking_request`, `human_agent_request`, …
- **Predefined flows** – ordered required/optional questions, typed answers, trigger words, final message + link.
- **Knowledge base** – the only source of truth the agent answers from (no hallucinations).
- **Link sending + click tracking** – short redirect URLs that count clicks.
- **Conversation tracking & lead management** – statuses: `active | completed | abandoned | needs_human`.
- **Admin app** – Dashboard, Conversations, Flows, Knowledge Base, Links, Analytics, Settings.
- **Analytics** – overview KPIs, funnels, drop-off by question, link clicks, top questions, time series.

## Quick start

### 1. Backend (creates the local DB file)

```bash
cd backend
cp .env.example .env        # optionally add OPENAI_API_KEY and WhatsApp creds
npm install
npm run db:push             # creates backend/prisma/dev.db (SQLite) + tables
npm run db:seed             # admin user + sample flow + knowledge base + links
npm run dev                 # http://localhost:4000
```

No database server to start — the SQLite file is created for you.

Default admin login (from seed): **admin@example.com / admin123**

### 2. Frontend

```bash
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:5173
```

## WhatsApp Cloud API wiring

1. Create a Meta app → add **WhatsApp** product → get a phone number ID + permanent token.
2. Set in `backend/.env`: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`.
3. In Meta dashboard set the webhook callback URL to:
   `https://<your-host>/api/whatsapp/webhook` and the verify token to `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe to the `messages` field.

> No WhatsApp credentials yet? The system still runs. Use the **simulator**:
> `POST /api/whatsapp/simulate { "phone": "972500000000", "text": "אני רוצה לקבוע פגישה" }`
> to drive the full agent pipeline locally without Meta.

## How the agent works (pipeline)

```
incoming msg ─▶ find/create Customer + Conversation ─▶ save Message
            ─▶ build context (KB + active flows + state + history)
            ─▶ OpenAI (JSON mode) ─▶ structured response
            ─▶ persist state + answers + analytics events
            ─▶ send reply (and link) via WhatsApp Cloud API
```

The AI service always returns the structured JSON described in the spec; only the `reply`
field is ever sent to the customer.

## Tech notes

- LLM provider is abstracted in `backend/src/services/aiAgent.js`. Default: OpenAI. If no
  `OPENAI_API_KEY` is set it falls back to a deterministic rule-based engine so the system
  still demos end-to-end.
- Auth is JWT (admin only). All `/api/*` admin routes require `Authorization: Bearer <token>`;
  the WhatsApp webhook is public (verified by Meta's challenge / verify token).

See `backend/README` section in code comments and `frontend/src/pages` for the UI.
