# Competition-first selection

ClubPulse selection is moving from location-first to competition-first.

## Canonical model

- `Competition` is a provider-backed competition/league.
- `Team` is a canonical ClubPulse team.
- `CompetitionTeam` records that a team participates in a competition.
- `Match` remains the source of fixtures/results and references both competition and teams.

`CompetitionTeam` is populated opportunistically from ingested matches now, and can later be enriched by provider team-list endpoints.

## TheSportsDB discovery

TheSportsDB V1 exposes league discovery through `search_all_leagues.php?s=Soccer`. The free API can return a limited list, so ClubPulse treats it as discovery rather than a complete global catalogue. Competitions seen in actual match ingestion are still upserted even if they are absent from discovery.

## API direction

- `GET /api/competitions` lists selectable competitions from PostgreSQL.
- `GET /api/competitions/{id}/teams` lists teams associated through `CompetitionTeam`.
- Match filtering will move to `competitionIds` + `teamIds` in the next UI step.
