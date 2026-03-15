-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threatLevel" TEXT NOT NULL,
    "summary" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "briefingId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "rawOutput" TEXT NOT NULL,
    "error" TEXT,
    CONSTRAINT "AgentRun_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NeoObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "nasaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "absoluteMagnitudeH" REAL NOT NULL,
    "diameterMinMeters" REAL NOT NULL,
    "diameterMaxMeters" REAL NOT NULL,
    "isPotentiallyHazardous" BOOLEAN NOT NULL,
    "isSentryObject" BOOLEAN NOT NULL,
    "closeApproachDate" TEXT NOT NULL,
    "velocityKmPerSecond" REAL NOT NULL,
    "missDistanceKm" REAL NOT NULL,
    "missDistanceLunar" REAL NOT NULL,
    "missDistanceAstronomical" REAL NOT NULL,
    "orbitingBody" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Reasoning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "briefingId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "threatLevel" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    CONSTRAINT "Reasoning_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "briefingId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "KnowledgeEntry_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_BriefingToNeoObject" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BriefingToNeoObject_A_fkey" FOREIGN KEY ("A") REFERENCES "Briefing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BriefingToNeoObject_B_fkey" FOREIGN KEY ("B") REFERENCES "NeoObject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NeoObject_nasaId_key" ON "NeoObject"("nasaId");

-- CreateIndex
CREATE UNIQUE INDEX "Reasoning_briefingId_key" ON "Reasoning"("briefingId");

-- CreateIndex
CREATE UNIQUE INDEX "_BriefingToNeoObject_AB_unique" ON "_BriefingToNeoObject"("A", "B");

-- CreateIndex
CREATE INDEX "_BriefingToNeoObject_B_index" ON "_BriefingToNeoObject"("B");
