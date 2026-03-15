import { PrismaClient } from '@/app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

function createPrismaClient() {
  const dbPath = path.resolve(process.cwd(), 'prisma/dev.db')
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
  return new PrismaClient({ adapter })
}

// Singleton pattern — prevents multiple PrismaClient instances during Next.js hot reload.
// Without this, every HMR cycle creates a new client and exhausts the connection pool.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
