import React from 'react'

export function MetricCard({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-800/40 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-indigo-500/25">
      <div className="text-xs uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div
        className={`
          mt-1 text-2xl font-bold text-gray-50
          ${color || ''}
        `}
      >
        {value}
      </div>
    </div>
  )
}
