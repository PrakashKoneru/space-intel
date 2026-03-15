import { PrismaClient } from '@/app/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

const dbPath = path.resolve(process.cwd(), 'prisma/dev.db')
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
const db = new PrismaClient({ adapter })

async function main() {
  console.log('Testing briefing create...')
  const b = await db.briefing.create({
    data: { threatLevel: 'GREEN', confidence: 'high', summary: 'test summary' }
  })
  console.log('Briefing created:', b.id)

  console.log('Testing agentRun createMany...')
  await db.agentRun.createMany({
    data: [{ briefingId: b.id, agent: 'neo', status: 'success', durationMs: 100, rawOutput: '{}' }]
  })
  console.log('AgentRun created')

  console.log('Testing spaceWeatherRecord create...')
  await db.spaceWeatherRecord.create({
    data: { briefingId: b.id, kpIndex: 2.0, stormLevel: 'None', solarFlares: '[]', summary: 'test' }
  })
  console.log('SpaceWeatherRecord created')

  console.log('Testing reasoning create...')
  await db.reasoning.create({
    data: { briefingId: b.id, prompt: 'test prompt', response: 'test response', threatLevel: 'GREEN', model: 'claude-sonnet-4-6' }
  })
  console.log('Reasoning created')

  console.log('Testing neoObject upsert...')
  await db.neoObject.upsert({
    where: { nasaId: 'test123' },
    update: { name: 'Test', absoluteMagnitudeH: 1.0, diameterMinMeters: 1.0, diameterMaxMeters: 2.0, isPotentiallyHazardous: false, isSentryObject: false, closeApproachDate: '2026-03-15', velocityKmPerSecond: 1.0, missDistanceKm: 1.0, missDistanceLunar: 1.0, missDistanceAstronomical: 1.0, orbitingBody: 'Earth', briefings: { connect: { id: b.id } } },
    create: { nasaId: 'test123', name: 'Test', absoluteMagnitudeH: 1.0, diameterMinMeters: 1.0, diameterMaxMeters: 2.0, isPotentiallyHazardous: false, isSentryObject: false, closeApproachDate: '2026-03-15', velocityKmPerSecond: 1.0, missDistanceKm: 1.0, missDistanceLunar: 1.0, missDistanceAstronomical: 1.0, orbitingBody: 'Earth', briefings: { connect: { id: b.id } } },
  })
  console.log('NeoObject upserted')

  console.log('All DB operations succeeded!')
  await db.$disconnect()
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
