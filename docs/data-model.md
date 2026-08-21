# ClubPulse data model rules

ClubPulse keeps canonical product identities separate from provider identities.

## Canonical hierarchy

- `Country` owns `City`.
- `City` optionally owns `Club`. A club can have an unknown city when it is only an opponent discovered from a provider.
- `Club` owns `Team`.
- `Sport` classifies clubs, competitions, and matches in the current model.
- `Competition` owns `Match`.
- `Match` references canonical home and away `Team` records.

## Mapping rules

1. Canonical IDs such as `benfica-senior` or `lisbon` belong to ClubPulse and must not be replaced by provider IDs.
2. Provider IDs are stored in `sourceProvider` + `sourceExternalId`.
3. Explicit local mappings live under `lib/catalog/`. Connector-specific search terms stay inside the connector.
4. A provider-discovered opponent is not automatically a local club. Its `cityId` remains `null` until ClubPulse has a verified mapping.
5. Do not create placeholder geography such as an `External` country or city.
6. Competition country mappings must be based on known provider IDs, not display-name substring matching.
7. Ingestion must be idempotent and upsert entities by canonical ID or provider identity as appropriate.

## Schema migrations

Schema changes are committed under `prisma/migrations` and applied explicitly with:

```bash
npm run db:migrate:deploy
```

Run migrations against the target database before deploying ingestion code that depends on the new schema.
