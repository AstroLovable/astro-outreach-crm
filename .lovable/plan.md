
# AstroLabs CRM — Build Plan

A solo-use CRM for AstroLabs & Co. with clients, pipeline, proposals, quotes/invoices, tasks, an embeddable AI chatbot with human handoff, and Groq-powered AI throughout.

## Stack & infrastructure

- TanStack Start (project template) + React + Tailwind (existing setup)
- Lovable Cloud (Supabase) for DB, auth, storage
- Server functions (`createServerFn`) for all AI calls — Groq key stays server-side
- Public server route (`/api/public/chat`) for the embeddable widget
- Resend (via `RESEND_API_KEY`) for human-handoff emails
- jsPDF for invoice/proposal PDFs, papaparse for CSV import/export

## Design system

- Background `#EEF0F5`, primary `#2E3A59`, accent `#4A6FA5`, card white, radius 12px, Inter font
- Saturn logo SVG, sidebar nav, airy minimal layout — defined as semantic tokens in `src/styles.css`

## Data model (Supabase)

- `profiles` (single owner)
- `settings` (singleton: company info, VAT toggle, invoice prefix, services JSON, chatbot prompt, notify toggle)
- `clients` (name, business, email, phone, website, service_type, package, stage, created_at)
- `pipeline_stages` enum: Lead / Quoted / In Progress / Review / Completed / Retained
- `proposals` (client_id, content, services, package, notes)
- `quotes` & `invoices` (line_items jsonb, vat, totals, status, issue/due dates, number)
- `tasks` (client_id, title, due_date, priority, status)
- `notes` (client_id, type: note|email, body)
- `activity` (auto log for dashboard feed)
- `chat_sessions` (status, business name, page_url)
- `chat_messages` (session_id, role, content)
- RLS: owner-only via `auth.uid()`; chat insert allowed for anon on public endpoint

## Server functions (Groq AI)

All call `https://api.groq.com/openai/v1/chat/completions`, model `llama-3.3-70b-versatile`, single completion, no streaming.
- `generateProposal` — max_tokens 1000
- `suggestTasks` — JSON array, max_tokens 300
- `summarizeNotes` — 3 sentences, max_tokens 150
- `draftReply` — max_tokens 250
- `chatbotReply` (public route) — max_tokens 300, last 4 messages only

## Routes

- `/` Dashboard — KPIs, pipeline summary, last 5 activity, quick-add
- `/clients` list + detail drawer; CSV import (column mapping) & export
- `/pipeline` Kanban DnD (`@dnd-kit`)
- `/proposals` form + AI generate + rich text + PDF
- `/billing` Quotes & Invoices, convert, mark paid, PDF
- `/tasks` global + per-client tasks, AI suggest
- `/chats` Live Chats list, take over, hand back, close, reply
- `/settings`
- `/api/public/chat` — chatbot endpoint
- `/embed.js` — single-script embed (served from public/) reading data attributes

## Embeddable chatbot

`public/embed.js` injects a floating widget into any host page. Data attributes: `data-color`, `data-name`, `data-greeting`, `data-business`. Talks to `/api/public/chat` (CORS open). "Talk to a Human" flips session status, triggers Resend email to `hello@astrolabs.uk` with transcript + page URL + CRM link. Widget polls for owner replies.

## Build order

1. Enable Lovable Cloud, create schema + RLS
2. Design tokens, layout shell, sidebar, Saturn logo
3. Settings (foundation: services/prices/prompt)
4. Clients (CRUD, CSV)
5. Pipeline (Kanban)
6. Tasks
7. Proposals (+ AI + PDF)
8. Quotes & Invoices (+ PDF)
9. Notes & Email log (+ AI)
10. Chatbot backend + Live Chats view + Resend handoff
11. Embed script
12. Dashboard wiring + activity log

## Notes / scope clarifications

- Solo-use → single-owner auth (email/password). No multi-tenant.
- The Groq and Resend API keys you pasted will be stored as server secrets (`GROQ_API_KEY`, `RESEND_API_KEY`) — never exposed to the client.
- This is a substantial multi-day build; I'll ship it as one cohesive first pass that's structurally complete and visually polished, then we iterate on any rough edges per area.

Approve to proceed and I'll start with Cloud + schema.
