'use client'

import { useState, useRef, useEffect } from 'react'
import type { NeoResult, SpaceWeatherResult, SpaceNewsResult } from '@/lib/types'

type AgentName = 'neo' | 'weather' | 'news' | 'orchestrator'
type AgentStatus = 'idle' | 'running' | 'done' | 'error'

interface AgentState {
  status: AgentStatus
  summary?: string
  error?: string
}

interface Briefing {
  id: string
  threatLevel: string
  confidence: string
  summary: string
}

interface LogLine {
  agent: AgentName
  text: string
  done: boolean // true = completed step, false = current active step
}

const AGENT_STEPS: Record<AgentName, string[]> = {
  neo: [
    'Connecting to NASA NeoWs API…',
    'Fetching close approaches for today…',
    'Parsing asteroid orbital data…',
    'Flagging hazardous & Sentry objects…',
  ],
  weather: [
    'Opening Browserbase session…',
    'Loading NOAA Space Weather Center…',
    'Extracting Kp index and storm level…',
    'Reading solar flare activity…',
  ],
  news: [
    'Opening Browserbase session…',
    'Navigating to SpaceNews.com…',
    'Scanning top headlines…',
    'Checking for NEO references…',
    'Checking for weather event coverage…',
  ],
  orchestrator: [
    'Building analysis prompt…',
    'Sending to Claude…',
    'Streaming summary…',
  ],
}

const AGENT_LABELS: Record<AgentName, string> = {
  neo:          'NEO Watch — NASA',
  weather:      'Space Weather — NOAA',
  news:         'News Confirmation — SpaceNews',
  orchestrator: 'Orchestrator — Claude',
}

const THREAT_COLORS: Record<string, string> = {
  GREEN:  'bg-green-900 text-green-300 border-green-700',
  YELLOW: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  RED:    'bg-red-900 text-red-300 border-red-700',
}

const IDLE_AGENT: AgentState = { status: 'idle' }

export default function Home() {
  const [agents, setAgents] = useState<Record<AgentName, AgentState>>({
    neo: IDLE_AGENT, weather: IDLE_AGENT, news: IDLE_AGENT, orchestrator: IDLE_AGENT,
  })
  const [logLines, setLogLines] = useState<LogLine[]>([])
  const [neo, setNeo] = useState<NeoResult | null>(null)
  const [weather, setWeather] = useState<SpaceWeatherResult | null>(null)
  const [news, setNews] = useState<SpaceNewsResult | null>(null)
  const [summaryChunks, setSummaryChunks] = useState('')
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [running, setRunning] = useState(false)

  const timersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const agentStepIdx = useRef<Record<string, number>>({})
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (running) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines, running])

  function addLogLine(agent: AgentName, text: string, done: boolean) {
    setLogLines(prev => {
      // If last line for this agent is the active step, mark it done and add new
      const updated = [...prev]
      const lastIdx = [...updated].reverse().findIndex(l => l.agent === agent)
      if (lastIdx !== -1 && !updated[updated.length - 1 - lastIdx].done) {
        updated[updated.length - 1 - lastIdx] = { ...updated[updated.length - 1 - lastIdx], done: true }
      }
      return [...updated, { agent, text, done }]
    })
  }

  function startTicking(agent: AgentName) {
    const steps = AGENT_STEPS[agent]
    agentStepIdx.current[agent] = 0
    const tick = () => {
      const i = agentStepIdx.current[agent]
      if (i < steps.length) {
        addLogLine(agent, steps[i], false)
        agentStepIdx.current[agent] = i + 1
      }
    }
    tick()
    timersRef.current[agent] = setInterval(tick, 1800)
  }

  function stopTicking(agent: AgentName) {
    clearInterval(timersRef.current[agent])
    delete timersRef.current[agent]
    // Mark the last active line for this agent as done
    setLogLines(prev => prev.map((l, i, arr) => {
      if (l.agent !== agent || l.done) return l
      // Only the last one for this agent
      const isLast = arr.slice(i + 1).every(x => x.agent !== agent || x.done)
      return isLast ? { ...l, done: true } : l
    }))
  }

  function resetState() {
    Object.values(timersRef.current).forEach(clearInterval)
    timersRef.current = {}
    agentStepIdx.current = {}
    setAgents({ neo: IDLE_AGENT, weather: IDLE_AGENT, news: IDLE_AGENT, orchestrator: IDLE_AGENT })
    setLogLines([])
    setNeo(null); setWeather(null); setNews(null)
    setSummaryChunks(''); setBriefing(null)
  }

  function runBriefing() {
    if (running) return
    resetState()
    setRunning(true)

    const es = new EventSource('/api/briefing')

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)
      const agent = event.agent as AgentName

      if (event.type === 'agent_start') {
        setAgents(prev => ({ ...prev, [agent]: { status: 'running' } }))
        startTicking(agent)
      }

      if (event.type === 'agent_complete') {
        stopTicking(agent)
        const data = event.data
        let summary = ''
        if (agent === 'neo') {
          const r = data as NeoResult
          setNeo(r)
          const flagged = r.objects.filter(o => o.isPotentiallyHazardous || o.isSentryObject).length
          summary = `${r.count} objects tracked${flagged ? `, ${flagged} flagged` : ', none flagged'}`
        }
        if (agent === 'weather') {
          const r = data as SpaceWeatherResult
          setWeather(r)
          summary = `Kp ${r.kpIndex} · ${r.stormLevel === 'None' ? 'No storms' : r.stormLevel + ' storm'}`
        }
        if (agent === 'news') {
          const r = data as SpaceNewsResult
          setNews(r)
          summary = `${r.headlines.length} headlines · ${r.confirmedNeoIds.length + (r.confirmedWeatherEvent ? 1 : 0)} confirmations`
        }
        setAgents(prev => ({ ...prev, [agent]: { status: 'done', summary } }))
      }

      if (event.type === 'agent_error') {
        stopTicking(agent)
        setAgents(prev => ({ ...prev, [agent]: { status: 'error', error: event.error } }))
      }

      if (event.type === 'orchestrator_start') {
        setAgents(prev => ({ ...prev, orchestrator: { status: 'running' } }))
        startTicking('orchestrator')
      }

      if (event.type === 'orchestrator_chunk') {
        setSummaryChunks(prev => prev + event.data)
      }

      if (event.type === 'orchestrator_complete') {
        stopTicking('orchestrator')
        const b = event.data as Briefing
        setBriefing(b)
        setAgents(prev => ({ ...prev, orchestrator: { status: 'done', summary: 'Briefing complete' } }))
        setRunning(false)
        es.close()
      }

      if (event.type === 'error') {
        setRunning(false)
        es.close()
      }
    }

    es.onerror = () => { setRunning(false); es.close() }
  }

  useEffect(() => () => { Object.values(timersRef.current).forEach(clearInterval) }, [])

  const dot = (s: AgentStatus) => {
    if (s === 'idle')    return <span className="text-zinc-700">○</span>
    if (s === 'running') return <span className="text-yellow-400 animate-pulse">●</span>
    if (s === 'done')    return <span className="text-green-500">●</span>
    return                      <span className="text-red-500">●</span>
  }

  const showBriefing = !!briefing || !!summaryChunks

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-mono overflow-hidden text-sm">

      {/* ── Left panel ── */}
      <div className="flex-1 flex flex-col border-r border-zinc-800 overflow-hidden">

        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <span className="text-xs tracking-widest uppercase text-zinc-500">Space Intel</span>
          <button
            onClick={runBriefing}
            disabled={running}
            className="px-4 py-1.5 text-xs rounded bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition font-bold tracking-wide"
          >
            {running ? 'Running…' : 'Run Briefing'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

          {/* Empty state */}
          {!running && !showBriefing && (
            <p className="text-zinc-600">Hit "Run Briefing" to generate today's intelligence report.</p>
          )}

          {/* Live log — shown while running, hidden once briefing arrives */}
          {running && !showBriefing && logLines.length > 0 && (
            <div className="space-y-1">
              {logLines.map((line, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-xs mt-0.5 shrink-0 ${line.done ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {line.done ? '✓' : '›'}
                  </span>
                  <span className={`text-xs leading-5 ${line.done ? 'text-zinc-600' : 'text-zinc-300'}`}>
                    <span className="text-zinc-600">[{AGENT_LABELS[line.agent].split(' — ')[0]}]</span>{' '}
                    {line.text}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {/* Briefing summary */}
          {showBriefing && (
            <div>
              {briefing && (
                <div className="flex gap-2 mb-4">
                  <span className={`text-xs px-2 py-0.5 rounded border font-bold ${THREAT_COLORS[briefing.threatLevel] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                    {briefing.threatLevel}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400">
                    {briefing.confidence} confidence
                  </span>
                </div>
              )}
              <div className="leading-7 text-zinc-200 whitespace-pre-wrap">
                {summaryChunks}
                {running && <span className="animate-pulse text-zinc-500">▌</span>}
              </div>
            </div>
          )}

          {/* NEO table */}
          {neo && (
            <div>
              <h2 className="text-xs tracking-widest uppercase text-zinc-500 mb-3">
                NEO Watch — {neo.count} objects today
              </h2>
              <div className="rounded border border-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-900 text-zinc-500">
                      <th className="text-left px-3 py-2 font-normal">Object</th>
                      <th className="text-right px-3 py-2 font-normal">Lunar dist</th>
                      <th className="text-right px-3 py-2 font-normal">km/s</th>
                      <th className="text-center px-3 py-2 font-normal">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {neo.objects.map((o, i) => (
                      <tr key={o.nasaId} className={`border-t border-zinc-800 ${i % 2 ? 'bg-zinc-900/30' : ''}`}>
                        <td className="px-3 py-1.5 text-zinc-300">{o.name}</td>
                        <td className="px-3 py-1.5 text-right text-zinc-400">{o.missDistanceLunar.toFixed(1)}</td>
                        <td className="px-3 py-1.5 text-right text-zinc-400">{o.velocityKmPerSecond.toFixed(1)}</td>
                        <td className="px-3 py-1.5 text-center">
                          {o.isPotentiallyHazardous && <span className="text-yellow-400" title="Potentially Hazardous">⚠</span>}
                          {o.isSentryObject && <span className="text-red-400 ml-1" title="Sentry Object">◉</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-zinc-600 text-xs mt-1.5">⚠ Potentially Hazardous &nbsp;·&nbsp; ◉ Sentry Object</p>
            </div>
          )}

          {/* Weather + News */}
          {(weather || news) && (
            <div className="grid grid-cols-2 gap-4">
              {weather && (
                <div className="rounded border border-zinc-800 p-4">
                  <h3 className="text-xs tracking-widest uppercase text-zinc-500 mb-3">Space Weather</h3>
                  <div className="space-y-1.5 text-xs text-zinc-400">
                    <div className="flex justify-between">
                      <span>Kp Index</span>
                      <span className="text-zinc-200">{weather.kpIndex}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Storm Level</span>
                      <span className={weather.stormLevel === 'None' ? 'text-green-400' : 'text-yellow-400'}>{weather.stormLevel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Solar Flares</span>
                      <span className="text-zinc-200">{weather.solarFlares.length > 0 ? weather.solarFlares.join(', ') : 'None'}</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600 mt-3 leading-5">{weather.summary}</p>
                </div>
              )}
              {news && (
                <div className="rounded border border-zinc-800 p-4">
                  <h3 className="text-xs tracking-widest uppercase text-zinc-500 mb-3">Headlines</h3>
                  <ul className="space-y-2">
                    {news.headlines.map((h, i) => (
                      <li key={i} className="text-xs text-zinc-400 leading-4">
                        <span className="text-zinc-600">— </span>{h.title}
                      </li>
                    ))}
                  </ul>
                  <p className={`text-xs mt-3 ${news.confirmedNeoIds.length > 0 || news.confirmedWeatherEvent ? 'text-yellow-400' : 'text-zinc-600'}`}>
                    {news.confirmationSummary}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Right panel: Agent Status ── */}
      <div className="w-64 flex flex-col overflow-hidden shrink-0">
        <div className="px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-xs tracking-widest uppercase text-zinc-500">Agents</h2>
        </div>
        <div className="flex-1 px-5 py-5 flex flex-col gap-5">
          {(['neo', 'weather', 'news', 'orchestrator'] as AgentName[]).map(name => {
            const state = agents[name]
            return (
              <div key={name} className="flex items-start gap-2">
                <span className="mt-0.5 text-xs shrink-0">{dot(state.status)}</span>
                <div>
                  <p className={`text-xs font-semibold ${
                    state.status === 'running' ? 'text-zinc-100' :
                    state.status === 'done'    ? 'text-zinc-300' :
                                                 'text-zinc-600'
                  }`}>
                    {AGENT_LABELS[name]}
                  </p>
                  {state.summary && (
                    <p className="text-xs text-zinc-600 mt-0.5">{state.summary}</p>
                  )}
                  {state.error && (
                    <p className="text-xs text-red-500 mt-0.5 truncate max-w-[180px]">{state.error}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
