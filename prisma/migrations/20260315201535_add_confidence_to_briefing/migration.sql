/*
  Warnings:

  - Added the required column `confidence` to the `Briefing` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Briefing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "threatLevel" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "summary" TEXT NOT NULL
);
INSERT INTO "new_Briefing" ("createdAt", "id", "summary", "threatLevel") SELECT "createdAt", "id", "summary", "threatLevel" FROM "Briefing";
DROP TABLE "Briefing";
ALTER TABLE "new_Briefing" RENAME TO "Briefing";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
