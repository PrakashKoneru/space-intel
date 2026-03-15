import { NeoResult, NeoObject } from '@/lib/types'

export async function runNeoAgent(): Promise<NeoResult> {
  const today = new Date().toISOString().split('T')[0] // "YYYY-MM-DD"

  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${process.env.NASA_API_KEY}`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`NASA NEO API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  const rawObjects = data.near_earth_objects[today] ?? []

  const objects: NeoObject[] = rawObjects.map((obj: any) => {
    const approach = obj.close_approach_data[0]

    return {
      nasaId:                  obj.id,
      name:                    obj.name,
      absoluteMagnitudeH:      obj.absolute_magnitude_h,
      diameterMinMeters:       obj.estimated_diameter.meters.estimated_diameter_min,
      diameterMaxMeters:       obj.estimated_diameter.meters.estimated_diameter_max,
      isPotentiallyHazardous:  obj.is_potentially_hazardous_asteroid,
      isSentryObject:          obj.is_sentry_object,
      closeApproachDate:       approach.close_approach_date,
      velocityKmPerSecond:     parseFloat(approach.relative_velocity.kilometers_per_second),
      missDistanceKm:          parseFloat(approach.miss_distance.kilometers),
      missDistanceLunar:       parseFloat(approach.miss_distance.lunar),
      missDistanceAstronomical: parseFloat(approach.miss_distance.astronomical),
      orbitingBody:            approach.orbiting_body,
    }
  })

  return {
    date:    today,
    count:   objects.length,
    objects,
  }
}
