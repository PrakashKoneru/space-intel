-- CreateTable
CREATE TABLE "SpaceWeatherRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "briefingId" TEXT NOT NULL,
    "kpIndex" REAL NOT NULL,
    "stormLevel" TEXT NOT NULL,
    "solarFlares" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    CONSTRAINT "SpaceWeatherRecord_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SpaceWeatherRecord_briefingId_key" ON "SpaceWeatherRecord"("briefingId");
