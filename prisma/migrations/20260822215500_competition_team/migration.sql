-- Model explicit competition membership so team choices do not depend on city metadata.
CREATE TABLE "CompetitionTeam" (
    "competitionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionTeam_pkey" PRIMARY KEY ("competitionId", "teamId")
);

CREATE INDEX "CompetitionTeam_teamId_idx" ON "CompetitionTeam"("teamId");
CREATE INDEX "Match_competitionId_scheduledAt_idx" ON "Match"("competitionId", "scheduledAt");

ALTER TABLE "CompetitionTeam"
ADD CONSTRAINT "CompetitionTeam_competitionId_fkey"
FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompetitionTeam"
ADD CONSTRAINT "CompetitionTeam_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bootstrap membership from match data already present in PostgreSQL.
INSERT INTO "CompetitionTeam" ("competitionId", "teamId")
SELECT DISTINCT "competitionId", "homeTeamId" FROM "Match"
ON CONFLICT DO NOTHING;

INSERT INTO "CompetitionTeam" ("competitionId", "teamId")
SELECT DISTINCT "competitionId", "awayTeamId" FROM "Match"
ON CONFLICT DO NOTHING;
