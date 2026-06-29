import React, { useState, useEffect } from 'react'
import { useTwinLink } from './hooks/useTwinLink'
import { StatusBadge } from './components/StatusBadge'
import { MetricCard } from './components/MetricCard'
import { SetupPanel } from './components/SetupPanel'
import { ChatPanel } from './components/ChatPanel'

export function App() {
  const {
    link,
    status,
    messages,
    latency,
    jitter,
    updateMetrics,
    addLocalMessage,
  } = useTwinLink()
  const [error, setError] = useState<string | null>(null)
  const [autoPing, setAutoPing] = useState(false)

  useEffect(() => {
    if (!autoPing || status !== 'connected') return

    const interval = setInterval(async () => {
      try {
        await link.ping()
        updateMetrics()
      } catch (e) {
        console.error('Auto ping failed:', e)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [autoPing, status, link])

  async function handlePing() {
    if (status !== 'connected') return
    try {
      await link.ping()
      updateMetrics()
    } catch (e) {
      console.error('Ping failed:', e)
    }
  }

  return (
    <div className="mx-auto my-10 max-w-3xl px-4">
      <div className="mb-6 rounded-3xl border border-white/10 bg-slate-900/70 p-7 shadow-2xl backdrop-blur-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
          <h1 className="m-0 bg-gradient-to-br from-indigo-500 to-purple-500 bg-clip-text text-2xl font-extrabold text-transparent">
            TwinLink Chat Demo
          </h1>
          <StatusBadge status={status} />
        </div>

        {error && (
          <div
            className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300"
            data-testid="error-message"
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {status === 'connected' && (
          <div className="mb-6 grid grid-cols-3 gap-4">
            <MetricCard
              label="Latency"
              value={latency > 0 ? `${latency.toFixed(1)} ms` : '--'}
            />
            <MetricCard
              label="Jitter"
              value={jitter > 0 ? `${jitter.toFixed(1)} ms` : '--'}
            />
            <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-slate-800/40 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-indigo-500/25">
              <div className="mb-1.5 text-xs uppercase tracking-wider text-gray-400">
                Network Profile
              </div>
              <div
                className={`
                  text-sm font-bold
                  ${
                    latency === 0
                      ? 'text-gray-400'
                      : latency < 15
                        ? `text-emerald-500`
                        : latency < 50
                          ? `text-amber-500`
                          : `text-gray-400`
                  }
                `}
              >
                {latency === 0
                  ? 'Gathering...'
                  : latency < 15
                    ? 'Ultra Fast (LAN)'
                    : latency < 50
                      ? 'Excellent'
                      : 'Broadband/WiFi'}
              </div>
            </div>
          </div>
        )}

        <SetupPanel status={status} onReset={() => {}} onError={setError} />

        <ChatPanel
          messages={messages}
          status={status}
          onMessageSent={addLocalMessage}
        />

        {status === 'connected' && (
          <div className="mt-4 flex items-center justify-end gap-4 text-sm">
            <label className="flex cursor-pointer select-none items-center gap-1.5">
              <input
                type="checkbox"
                checked={autoPing}
                onChange={(e) => setAutoPing(e.target.checked)}
              />
              Auto-ping (2s)
            </label>
            <button
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/10"
              onClick={handlePing}
            >
              Ping Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
