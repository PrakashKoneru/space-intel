import { Stagehand } from '@browserbasehq/stagehand'
import { z } from 'zod'
import { SpaceWeatherResult } from '@/lib/types'

const WeatherSchema = z.object({
  kpIndex:     z.string(),
  stormLevel:  z.string(),
  solarFlares: z.array(z.string()),
  summary:     z.string(),
})

export async function runWeatherAgent(): Promise<SpaceWeatherResult> {
  const stagehand = new Stagehand({
    env:       'BROWSERBASE',
    apiKey:    process.env.BROWSERBASE_API_KEY!,
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    model:     'anthropic/claude-sonnet-4-6',
    modelClientOptions: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
    },
    verbose:   0,
  })

  try {
    await stagehand.init()

    await stagehand.context.activePage()?.goto('https://www.swpc.noaa.gov/')

    const result = await stagehand.extract(
      `Extract the following from the NOAA Space Weather Center page:
      - kpIndex: the current Kp index value (a number from 0 to 9 as a string)
      - stormLevel: the current geomagnetic storm level, one of: None, G1, G2, G3, G4, G5
      - solarFlares: an array of any active solar flare alerts or warnings currently shown, empty array if none
      - summary: a single sentence describing the current overall space weather conditions`,
      WeatherSchema
    )

    return result

  } finally {
    // always close the session — unclosed sessions count against Browserbase quota
    await stagehand.close()
  }
}
