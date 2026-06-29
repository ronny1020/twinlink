import React, { useState } from 'react'

type Props = {
  label: string
  value: string
  onChange?: (val: string) => void
  readOnly?: boolean
  testId?: string
  placeholder?: string
}

export function TokenArea({
  label,
  value,
  onChange,
  readOnly,
  testId,
  placeholder,
}: Props) {
  const [copied, setCopied] = useState(false)

  async function copyToClipboard() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy token:', err)
    }
  }

  return (
    <div className="mb-1.5 mt-4">
      <div className="text-sm font-semibold text-purple-400">{label}</div>
      <div className="relative mb-4">
        <textarea
          data-testid={testId}
          className="h-24 w-full resize-none rounded-lg border border-white/10 bg-slate-900/60 p-3 pr-16 font-mono text-xs text-gray-300 outline-none transition-colors focus:border-indigo-500/60"
          readOnly={readOnly}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          onClick={(e) =>
            readOnly && (e.target as HTMLTextAreaElement).select()
          }
        />
        {readOnly && (
          <button
            className="absolute right-2 top-2 rounded-md border border-indigo-500/30 bg-indigo-500/15 px-3 py-1 text-xs text-indigo-300 transition-all hover:bg-indigo-500/30 hover:text-white disabled:opacity-50"
            onClick={copyToClipboard}
            disabled={!value}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}
