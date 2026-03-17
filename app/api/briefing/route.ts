import '@/lib/env'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/lib/db'
import { runNeoAgent } from '@/lib/agents/neo'
import { runWeatherAgent } from '@/lib/agents/weather'
import { runNewsAgent } from '@/lib/agents/news'
import { NeoResult, SpaceWeatherResult, SpaceNewsResult, ThreatLevel, ConfidenceLevel, SSEEvent } from '@/lib/types'

// ----------------------------------------------------------------
// Threat level — driven by NEO (agent 1) + Weather (agent 2)
// ----------------------------------------------------------------
function calculateThreatLevel(neo: NeoResult, weather: SpaceWeatherResult): ThreatLevel {
  const neoFlagged = neo.objects.some(
    o => (o.isPotentiallyHazardous || o.isSentryObject) && o.missDistanceLunar < 10
  )
  const weatherElevated = ['G1', 'G2', 'G3', 'G4', 'G5'].includes(weather.stormLevel) || parseFloat(weather.kpIndex) >= 5

  if (neoFlagged && weatherElevated) return 'RED'
  if (neoFlagged || weatherElevated) return 'YELLOW'
  return 'GREEN'
}

// ----------------------------------------------------------------
// Confidence — driven by Weather (agent 2) + News (agent 3)
// Agreement in either direction = high
// One speaks, other silent = medium
// Contradiction = low
// ----------------------------------------------------------------
function calculateConfidence(weather: SpaceWeatherResult, news: SpaceNewsResult): ConfidenceLevel {
  const weatherElevated = ['G1', 'G2', 'G3', 'G4', 'G5'].includes(weather.stormLevel) || parseFloat(weather.kpIndex) >= 5
  const newsConfirmedWeather = news.confirmedWeatherEvent
  const newsMentionedSomething = news.confirmedNeoIds.length > 0 || news.confirmedWeatherEvent

  // contradiction — signals point in opposite directions
  if (weatherElevated && !newsConfirmedWeather && newsMentionedSomething === false) {
    // weather elevated but news is completely silent — could be stale scrape
    // only low if news actively reported calm, otherwise medium
  }
  if (!weatherElevated && newsMentionedSomething) return 'low'   // news sees something weather missed
  if (weatherElevated && !newsConfirmedWeather) return 'medium'  // weather flagged, news silent
  if (!weatherElevated && !newsMentionedSomething) return 'high' // both agree: all clear
  if (weatherElevated && newsConfirmedWeather) return 'high'     // both agree: elevated
  return 'medium'
}

// ----------------------------------------------------------------
// Orchestrator prompt — Claude writes the summary only
// Threat and confidence are pre-calculated and passed in
// ----------------------------------------------------------------
function buildPrompt(
  neo: NeoResult,
  weather: SpaceWeatherResult,
  news: SpaceNewsResult,
  threatLevel: ThreatLevel,
  confidence: ConfidenceLevel
): string {
  return `You are a space intelligence analyst writing a daily briefing.

The threat level has been calculated as ${threatLevel} with ${confidence} confidence based on the following data.

## NEO Watch — ${neo.count} objects passing Earth today
${neo.objects.map(o =>
  `- ${o.name}: ${o.missDistanceLunar.toFixed(2)} lunar distances, ${o.velocityKmPerSecond.toFixed(1)} km/s${o.isPotentiallyHazardous ? ', POTENTIALLY HAZARDOUS' : ''}${o.isSentryObject ? ', SENTRY OBJECT' : ''}`
).join('\n')}

## Space Weather (NOAA)
Kp Index: ${weather.kpIndex}
Storm Level: ${weather.stormLevel}
Solar Flares: ${weather.solarFlares.length > 0 ? weather.solarFlares.join(', ') : 'None'}
Conditions: ${weather.summary}

## Space News Confirmation
${news.confirmationSummary}
Confirmed NEO coverage: ${news.confirmedNeoIds.length > 0 ? news.confirmedNeoIds.join(', ') : 'none'}
Confirmed weather event: ${news.confirmedWeatherEvent ? 'yes' : 'no'}

Write a 3-5 sentence plain English summary of today's space situation for a general audience.
Explain the threat level and confidence. Be direct and clear. Do not repeat the raw numbers — interpret them.`
}

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        // ── Step 1: run NEO and weather in parallel ──────────────────
        send({ type: 'agent_start', agent: 'neo' })
        send({ type: 'agent_start', agent: 'weather' })

        const neoStart = Date.now()
        const weatherStart = Date.now()

        const [neoSettled, weatherSettled] = await Promise.allSettled([
          runNeoAgent(),
          runWeatherAgent(),
        ])

        const neo: NeoResult = neoSettled.status === 'fulfilled'
          ? neoSettled.value
          : { date: new Date().toISOString().split('T')[0], count: 0, objects: [] }

        const weather: SpaceWeatherResult = weatherSettled.status === 'fulfilled'
          ? weatherSettled.value
          : { kpIndex: '0', stormLevel: 'None', solarFlares: [], summary: 'Weather data unavailable.' }

        send({ type: neoSettled.status === 'fulfilled' ? 'agent_complete' : 'agent_error', agent: 'neo', data: neo, error: neoSettled.status === 'rejected' ? String(neoSettled.reason) : undefined })
        send({ type: weatherSettled.status === 'fulfilled' ? 'agent_complete' : 'agent_error', agent: 'weather', data: weather, error: weatherSettled.status === 'rejected' ? String(weatherSettled.reason) : undefined })

        // ── Step 2: run news agent with NEO + weather context ─────────
        send({ type: 'agent_start', agent: 'news' })
        const newsStart = Date.now()

        const newsSettled = await Promise.allSettled([runNewsAgent(neo, weather)])
        const newsResult = newsSettled[0]

        const news: SpaceNewsResult = newsResult.status === 'fulfilled'
          ? newsResult.value
          : { headlines: [], confirmedNeoIds: [], confirmedWeatherEvent: false, confirmationSummary: 'News data unavailable.' }

        send({ type: newsResult.status === 'fulfilled' ? 'agent_complete' : 'agent_error', agent: 'news', data: news, error: newsResult.status === 'rejected' ? String(newsResult.reason) : undefined })

        // ── Step 3: calculate threat + confidence programmatically ────
        const threatLevel = calculateThreatLevel(neo, weather)
        const confidence = calculateConfidence(weather, news)

        // ── Step 4: stream Claude summary ─────────────────────────────
        send({ type: 'orchestrator_start', agent: 'orchestrator' })

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
        const prompt = buildPrompt(neo, weather, news, threatLevel, confidence)

        let summary = ''
        const claudeStream = await anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        })

        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            summary += chunk.delta.text
            send({ type: 'orchestrator_chunk', agent: 'orchestrator', data: chunk.delta.text })
          }
        }

        // ── Step 5: save to DB (sequential explicit writes, no nested creates) ──
        const briefing = await db.briefing.create({
          data: { threatLevel, confidence, summary },
        })

        await db.agentRun.createMany({
          data: [
            {
              briefingId: briefing.id,
              agent:      'neo',
              status:     neoSettled.status === 'fulfilled' ? 'success' : 'error',
              durationMs: Date.now() - neoStart,
              rawOutput:  JSON.stringify(neo),
              error:      neoSettled.status === 'rejected' ? String(neoSettled.reason) : null,
            },
            {
              briefingId: briefing.id,
              agent:      'weather',
              status:     weatherSettled.status === 'fulfilled' ? 'success' : 'error',
              durationMs: Date.now() - weatherStart,
              rawOutput:  JSON.stringify(weather),
              error:      weatherSettled.status === 'rejected' ? String(weatherSettled.reason) : null,
            },
            {
              briefingId: briefing.id,
              agent:      'news',
              status:     newsResult.status === 'fulfilled' ? 'success' : 'error',
              durationMs: Date.now() - newsStart,
              rawOutput:  JSON.stringify(news),
              error:      newsResult.status === 'rejected' ? String(newsResult.reason) : null,
            },
          ],
        })

        await db.spaceWeatherRecord.create({
          data: {
            briefingId:  briefing.id,
            kpIndex:     parseFloat(weather.kpIndex) || 0,
            stormLevel:  weather.stormLevel,
            solarFlares: JSON.stringify(weather.solarFlares),
            summary:     weather.summary,
          },
        })

        await db.reasoning.create({
          data: {
            briefingId:  briefing.id,
            prompt:      prompt,
            response:    summary,
            threatLevel,
            model:       'claude-sonnet-4-6',
          },
        })

        // upsert each NEO object, then connect all to this briefing in one explicit write
        // (nested connect inside upsert.update is silently dropped by Prisma 7 + SQLite adapter)
        const neoIds: string[] = []
        for (const obj of neo.objects) {
          const neoData = {
            name:                     obj.name,
            absoluteMagnitudeH:       obj.absoluteMagnitudeH,
            diameterMinMeters:        obj.diameterMinMeters,
            diameterMaxMeters:        obj.diameterMaxMeters,
            isPotentiallyHazardous:   obj.isPotentiallyHazardous,
            isSentryObject:           obj.isSentryObject,
            closeApproachDate:        obj.closeApproachDate,
            velocityKmPerSecond:      obj.velocityKmPerSecond,
            missDistanceKm:           obj.missDistanceKm,
            missDistanceLunar:        obj.missDistanceLunar,
            missDistanceAstronomical: obj.missDistanceAstronomical,
            orbitingBody:             obj.orbitingBody,
          }
          const record = await db.neoObject.upsert({
            where:  { nasaId: obj.nasaId },
            update: { ...neoData },
            create: { nasaId: obj.nasaId, ...neoData },
          })
          neoIds.push(record.id)
        }
        for (const id of neoIds) {
          await db.briefing.update({
            where: { id: briefing.id },
            data:  { neoObjects: { connect: { id } } },
          })
        }

        send({
          type: 'orchestrator_complete',
          agent: 'orchestrator',
          data: { id: briefing.id, threatLevel, confidence, summary },
        })

      } catch (err) {
        console.error('[briefing] pipeline error:', err)
        send({ type: 'error', error: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
