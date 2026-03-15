// ----------------------------------------------------------------
// Agent output types
// These are what each agent returns. The orchestrator receives all
// three and uses them to produce a BriefingResult.
// These are NOT the same as Prisma models — those represent DB rows.
// The mapping from these types to DB rows happens in the API route.
// ----------------------------------------------------------------

export interface NeoObject {
  nasaId: string
  name: string
  absoluteMagnitudeH: number
  diameterMinMeters: number
  diameterMaxMeters: number
  isPotentiallyHazardous: boolean
  isSentryObject: boolean
  closeApproachDate: string
  velocityKmPerSecond: number
  missDistanceKm: number
  missDistanceLunar: number
  missDistanceAstronomical: number
  orbitingBody: string
}

export interface NeoResult {
  date: string
  count: number
  objects: NeoObject[]
}

export interface SpaceWeatherResult {
  kpIndex: string        // 0-9 scale, higher = more severe
  stormLevel: string     // "None" | "G1" | "G2" | "G3" | "G4" | "G5"
  solarFlares: string[]  // list of active flare alerts if any
  summary: string        // one sentence description of current conditions
}

export interface SpaceNewsHeadline {
  title:          string
  source:         string
  url:            string
  relatedNasaId?: string  // set if this article is about a specific asteroid we fetched today
}

export interface SpaceNewsResult {
  headlines:             SpaceNewsHeadline[]
  confirmedNeoIds:       string[]  // nasaIds that had independent news coverage today
  confirmedWeatherEvent: boolean   // did news corroborate the NOAA weather signal
  confirmationSummary:   string    // one sentence on what news confirmed or didn't
}

// ----------------------------------------------------------------
// SSE event protocol
// Every event the server pushes to the client follows this shape.
// Both the API route (sender) and BriefingStream component (receiver)
// import from here — this is the contract between them.
// ----------------------------------------------------------------

export type SSEEventType =
  | 'agent_start'        // agent has started running
  | 'agent_complete'     // agent finished successfully
  | 'agent_error'        // agent failed
  | 'orchestrator_start' // Claude has started reasoning
  | 'orchestrator_chunk' // streaming token from Claude
  | 'orchestrator_complete' // Claude finished, briefing saved
  | 'error'              // top-level error, stream will close

export type AgentName = 'neo' | 'weather' | 'news' | 'orchestrator'

export interface SSEEvent {
  type: SSEEventType
  agent?: AgentName
  data?: unknown  // agent result, streamed chunk, or completed briefing
  error?: string
}

// ----------------------------------------------------------------
// Orchestrator output
// The final result after Claude synthesizes all three agent outputs.
// This is what gets saved to the Briefing table and rendered in the UI.
// ----------------------------------------------------------------

export type ThreatLevel = 'GREEN' | 'YELLOW' | 'RED'
export type ConfidenceLevel = 'low' | 'medium' | 'high'

export interface BriefingResult {
  id: string
  createdAt: string
  threatLevel: ThreatLevel
  confidence: ConfidenceLevel
  summary: string
  neo: NeoResult
  weather: SpaceWeatherResult
  news: SpaceNewsResult
}
