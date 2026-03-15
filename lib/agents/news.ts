import { Stagehand } from '@browserbasehq/stagehand'
import { z } from 'zod'
import { SpaceNewsResult, NeoResult, SpaceWeatherResult } from '@/lib/types'

const NewsSchema = z.object({
  headlines: z.array(
    z.object({
      title:          z.string(),
      source:         z.string(),
      url:            z.string(),
      relatedNasaId:  z.string().optional(),
    })
  ),
  confirmedNeoIds:       z.array(z.string()),
  confirmedWeatherEvent: z.boolean(),
  confirmationSummary:   z.string(),
})

export async function runNewsAgent(
  neoResult: NeoResult,
  weatherResult: SpaceWeatherResult
): Promise<SpaceNewsResult> {

  // build context strings to pass into the agent instruction
  const asteroidNames = neoResult.objects
    .filter(o => o.isPotentiallyHazardous || o.isSentryObject)
    .map(o => `${o.name} (nasaId: ${o.nasaId})`)
    .join(', ')

  const weatherContext = `Kp index ${weatherResult.kpIndex}, storm level ${weatherResult.stormLevel}, solar flares: ${weatherResult.solarFlares.length > 0 ? weatherResult.solarFlares.join(', ') : 'none'}`

  const stagehand = new Stagehand({
    env:       'BROWSERBASE',
    apiKey:    process.env.BROWSERBASE_API_KEY!,
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    model:        { modelName: 'claude-3-7-sonnet-latest', apiKey: process.env.ANTHROPIC_API_KEY! },
    experimental: true,
    disableAPI:   true,
    verbose:      0,
    disablePino:  true,
  })

  try {
    await stagehand.init()

    const agent = stagehand.agent({
      model: { modelName: 'claude-3-7-sonnet-latest', apiKey: process.env.ANTHROPIC_API_KEY! },
    })

    const result = await agent.execute({
      instruction: `Go to https://spacenews.com and look at the homepage only — do not navigate to any other pages or perform any searches. Just read what is already visible on the homepage.

      Collect the 5 most recent headlines visible on the homepage.

      For each headline check:
      1. Does the title mention any of these asteroids: ${asteroidNames || 'none flagged today'}? If yes set relatedNasaId to the matching nasaId.
      2. Does the title mention solar weather events like geomagnetic storms, solar flares, CMEs, or coronal hole streams?

      For confirmedNeoIds: list nasaIds of any asteroids mentioned in the headlines.
      For confirmedWeatherEvent: true if any headline title mentions a solar weather event.
      For confirmationSummary: one sentence on what the news confirmed or did not confirm today.

      Once you have the 5 headlines you are done. Do not browse further.`,
      output: NewsSchema,
      maxSteps: 5,
    })

    const output = result.output as unknown as SpaceNewsResult
    if (!output?.headlines) {
      return { headlines: [], confirmedNeoIds: [], confirmedWeatherEvent: false, confirmationSummary: 'News agent returned incomplete data.' }
    }
    return output

  } finally {
    await stagehand.close()
  }
}
