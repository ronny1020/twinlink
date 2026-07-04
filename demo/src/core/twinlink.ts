import { createTwinLink } from 'twinlink'
import type { ChatMessage } from '../types/chat'

function getOptions() {
  const urlParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  )
  const noIce = urlParams.has('noice')
  return {
    rtc: noIce ? { iceServers: [] } : undefined,
    iceGatheringTimeoutMs: 5000,
  }
}

let currentLink = createTwinLink<unknown, ChatMessage>(getOptions())

export function getLink() {
  return currentLink
}

const listeners = new Set<() => void>()

export function resetLink() {
  currentLink.close()
  currentLink = createTwinLink<unknown, ChatMessage>(getOptions())
  listeners.forEach((l) => l())
}

export function onReset(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
