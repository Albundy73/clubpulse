-- Allow provider-discovered opponent clubs to exist without a fabricated city.
ALTER TABLE "Club" ALTER COLUMN "cityId" DROP NOT NULL;

-- Preserve clubs if a city is removed; an unknown location is preferable to
-- deleting the club, its teams, and matches.
ALTER TABLE "Club" DROP CONSTRAINT "Club_cityId_fkey";
ALTER TABLE "Club" ADD CONSTRAINT "Club_cityId_fkey"
  FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent duplicate city labels within one country.
CREATE UNIQUE INDEX "City_countryId_name_key" ON "City"("countryId", "name");

-- Common ClubPulse lookup paths.
CREATE INDEX "Club_sportId_idx" ON "Club"("sportId");
CREATE INDEX "Competition_sportId_countryId_idx" ON "Competition"("sportId", "countryId");
CREATE INDEX "Match_homeTeamId_scheduledAt_idx" ON "Match"("homeTeamId", "scheduledAt");
CREATE INDEX "Match_awayTeamId_scheduledAt_idx" ON "Match"("awayTeamId", "scheduledAt");

-- Sport names are canonical display labels in the current model.
CREATE UNIQUE INDEX "Sport_name_key" ON "Sport"("name");
