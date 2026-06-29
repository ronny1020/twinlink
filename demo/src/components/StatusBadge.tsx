import React from 'react'

export function StatusBadge({ status }: { status: RTCPeerConnectionState }) {
  const dotClasses =
    {
      new: 'bg-gray-400',
      connecting: 'bg-amber-500 animate-pulse',
      connected: 'bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse',
      closed: 'bg-red-500',
      failed: 'bg-red-500',
      disconnected: 'bg-red-500',
      checking: 'bg-amber-500',
    }[status] || 'bg-gray-400'

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold">
      <span
        className={`
          h-2 w-2 rounded-full
          ${dotClasses}
        `}
      />
      <span>
        Status: <strong className="capitalize">{status}</strong>
      </span>
    </div>
  )
}
