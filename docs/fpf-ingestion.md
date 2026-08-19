# FPF ingestion workflow

ClubPulse does not fetch FPF directly from the Next.js server because FPF currently returns HTTP 403 to GitHub Codespaces traffic.

The ingestion flow is therefore:

1. Run the FPF ingestion command from a machine/network that can access `resultados.fpf.pt`.
2. Normalize FPF match pages into the ClubPulse `Match` model.
3. Upsert clubs, teams, competitions and matches into PostgreSQL.
4. Let the Next.js application read only from PostgreSQL.

## Install dependencies

```bash
npm install @prisma/client @prisma/adapter-pg pg dotenv
npm install --save-dev prisma tsx @types/pg
```

Prisma 7 uses a PostgreSQL driver adapter and a generated client.

## Configure PostgreSQL

Copy `.env.example` to `.env` and set a PostgreSQL connection string that is reachable by both the ingestion machine and the ClubPulse web environment:

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/clubpulse?sslmode=require"
```

A managed PostgreSQL instance is recommended so both your local ingestion machine and GitHub Codespaces can reach the same database.

## Generate Prisma Client and create the schema

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## Run FPF ingestion

Run this from a network where the following command returns HTTP 200:

```bash
curl -L -sS -o /dev/null -w "%{http_code}\n" "https://resultados.fpf.pt/Match/GetMatchInformation?matchId=2346635"
```

Then execute:

```bash
npx tsx scripts/ingest-fpf.ts
```

The command is idempotent: matches are upserted using `(sourceProvider, sourceExternalId)`.

## Verify the stored data

In the ClubPulse web environment, open:

```text
/api/fpf/sporting-benfica
```

or query by location/sport:

```text
/api/matches?cityId=lisbon&sportId=football
```

The web server does not contact FPF from either endpoint; both read PostgreSQL only.
