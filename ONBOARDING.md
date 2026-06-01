# Rayalaseema News — Developer Onboarding

Get a new developer to an identical local setup — same code, same data.

## What you receive

| Item | Source |
|------|--------|
| Code | This Git repo (`git clone`) |
| Database data (categories, districts, ~334 articles, e-paper) | `db-snapshot.sql` — sent separately, **not in git** |
| API keys | Filled into `.env` — get from team lead, never committed |

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- PostgreSQL 16+ running locally
- Git

## Setup

```bash
# 1. Clone + install
git clone https://github.com/mailtomcs2023/rayalaseema-news.git
cd rayalaseema-news
bun install

# 2. Create the local database
psql -U postgres -c "CREATE DATABASE rayalaseema_express;"

# 3. Restore the data snapshot (file sent by team lead)
psql -U postgres -d rayalaseema_express < db-snapshot.sql

# 4. Environment — copy the template into BOTH apps, fill values
cp .env.example apps/web/.env
cp .env.example apps/admin/.env
#   REQUIRED: DATABASE_URL, NEXTAUTH_SECRET
#   OPTIONAL: AZURE_OPENAI_*, NEWSDATA_API_KEY, AZURE_STORAGE_CONNECTION_STRING,
#             RAPIDAPI_CRICKET_KEY — blank = that feature returns 503, app still runs

# 5. Prisma client
cd packages/db && bunx prisma generate && cd ../..

# 6. Run
bun run --filter=web dev      # web  → http://localhost:3000
bun run --filter=admin dev    # admin → http://localhost:3001
```

## Without API keys

The app **boots fine** with only `DATABASE_URL` + `NEXTAUTH_SECRET`. Each integration
degrades independently — a missing key makes that one route return `503 "X not configured"`,
it never crashes the app. Fill keys only for features you're working on.

## Refreshing the data snapshot

Team lead regenerates and reshares when data changes significantly:

```bash
pg_dump -U postgres --no-owner --no-acl rayalaseema_express > db-snapshot.sql
```

## Admin login (from the seed / snapshot)

`admin@rayalaseemanews.com` / `admin123`
