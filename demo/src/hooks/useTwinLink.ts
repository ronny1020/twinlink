import { useState, useEffect } from 'react'
import { getLink, onReset } from '../core/twinlink'
import type { Message, ChatMessage } from '../types/chat'

export function useTwinLink() {
  const [link, setLink] = useState(getLink())
  const [status, setStatus] = useState<RTCPeerConnectionState>(
    link.connectionState,
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [latency, setLatency] = useState(0)
  const [jitter, setJitter] = useState(0)

  useEffect(() => {
    const cleanup = onReset(() => {
      const newLink = getLink()
      setLink(newLink)
      setStatus(newLink.connectionState)
      setMessages([])
      setLatency(0)
      setJitter(0)
    })

    return cleanup
  }, [])

  useEffect(() => {
    const unsubState = link.onConnectionStateChange(setStatus)
    const unsubMsg = link.reliable.onMessage((msg: unknown) => {
      const chatMsg = msg as ChatMessage
      if (chatMsg?.type === 'chat') {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            text: chatMsg.text,
            sender: 'them',
            timestamp: Date.now(),
          },
        ])
      }
    })

    return () => {
      unsubState()
      unsubMsg()
    }
  }, [link])

  function updateMetrics() {
    setLatency(link.latency)
    setJitter(link.jitter)
  }

  function addLocalMessage(text: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text,
        sender: 'me',
        timestamp: Date.now(),
      },
    ])
  }

  return {
    link,
    status,
    messages,
    latency,
    jitter,
    updateMetrics,
    addLocalMessage,
    clearMessages: () => setMessages([]),
  }
}
