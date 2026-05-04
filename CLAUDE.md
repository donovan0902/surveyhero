# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

## Commands

```bash
npm run dev        # starts Next.js + Convex backend in parallel (use this for all local development)
npm run build      # Next.js production build
npm run lint       # ESLint
npm run format     # Prettier
```

There is no test runner configured.

## Architecture

**SurveyHero** is a voice-first survey platform. Creators build surveys, publish them, and respondents answer via a live AI voice conversation (ElevenLabs). Open-ended responses are then analyzed by Claude to extract themes and generate narrative summaries.

### Stack

- **Next.js 16** (App Router) — frontend and routing
- **Convex** — database, server functions, HTTP endpoints, scheduled jobs
- **WorkOS AuthKit** — authentication (JWT-based, verified in Convex via `convex/auth.config.ts`)
- **ElevenLabs** — conversational AI agent for voice surveys
- **Anthropic Claude** — theme extraction (`claude-haiku-4-5`) and narrative summarization (`claude-sonnet-4-6`)

### Convex schema (8 tables)

- `users` — populated by WorkOS webhooks; `authId` = WorkOS user ID
- `surveys` — creator-owned; status: `draft | published | closed`; stores ElevenLabs agent ID + config hash for dedup
- `questions` — belong to a survey; types: `open-ended | closed | rating | yes-no`; have `followUpBehavior` for voice agent probing
- `surveyResponses` — one per (respondent × survey) for signed-in users; anonymous voice sessions create fresh rows; tracks `currentQuestionId` during a live call
- `questionResponses` — one per (response × question); the canonical source of answer data
- `responseThemes` — LLM-extracted themes per open-ended `questionResponse` (up to 5 per answer)
- `themeCounters` — denormalized `(questionId, themeKey) → count` for O(1) live reads; maintained by `upsertResponseThemes`
- `questionAggregates` — per-question LLM narrative + theme distribution; has a `dirty` flag and rebuilt via stale-while-revalidate

### Key data flows

**Voice survey session** (`convex/elevenlabs.ts`):
1. `startVoiceResponse` action: syncs ElevenLabs agent config (hash-deduped PATCH/POST), creates/reuses a `surveyResponse`, obtains a signed URL
2. During the call, ElevenLabs posts to `/elevenlabs/tools/record-answer` (HTTP endpoint) → `recordToolAnswer` mutation validates and writes each answer, advances `currentQuestionId`
3. After the call, ElevenLabs posts to `/elevenlabs/post-call` (HMAC-verified webhook) → `handlePostCallWebhook` marks the response `completed` or `abandoned` based on required-question coverage

**Theme extraction pipeline** (`convex/aggregations.ts`):
- `recordToolAnswer` schedules `extractThemesForResponse` immediately for open-ended answers
- `extractThemesForResponse` (internal action) calls Claude with structured tool use, writes themes to `responseThemes`, increments `themeCounters`, marks `questionAggregates` dirty
- `requestRefresh` (public mutation, called by the UI) schedules `rebuildRootSummary` if the aggregate is dirty — this is the stale-while-revalidate trigger
- Daily cron (`convex/crons.ts`) runs `canonicalizeThemes` per question to collapse synonym theme labels via Claude

### Frontend structure

Next.js pages are thin shells (`app/…/page.tsx`) that render a single feature Shell component:
- `components/builder/` — survey creation/editing UI
- `components/respond/` — live voice session UI (`ConversationProvider` from `@elevenlabs/react` wraps `RespondShell`)
- `components/responses/` — post-survey analytics view
- `components/dashboard/` — survey list with response counts
- `components/ui/` — shadcn/ui primitives

### HTTP endpoints (Convex)

Defined in `convex/http.ts`:
- `POST /elevenlabs/post-call` — post-call webhook; verifies HMAC-SHA256 `elevenlabs-signature` header (30-min replay window)
- `POST /elevenlabs/tools/record-answer` — server tool; authenticated via `X-SurveyHero-Secret` shared secret embedded in the agent config

### Auth pattern

- Next.js server components: `withAuth()` from `@workos-inc/authkit-nextjs`
- Convex functions: `ctx.auth.getUserIdentity()` then look up `users` by `authId`
- `users` rows are created by WorkOS events routed through `convex/auth.ts`

### Environment variables

Required in `.env.local` (see README for setup):
- `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_TOOL_SECRET`
- `ANTHROPIC_API_KEY`
- Optional: `ELEVENLABS_AGENT_LLM` (defaults to `gemini-2.5-flash`), `ELEVENLABS_VOICE_ID`
