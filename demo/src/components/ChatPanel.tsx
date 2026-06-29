import React, { useState, useRef, useEffect } from 'react'
import { getLink } from '../core/twinlink'
import type { Message, ChatMessage } from '../types/chat'

type Props = {
  messages: Message[]
  status: RTCPeerConnectionState
  onMessageSent: (text: string) => void
}

export function ChatPanel({ messages, status, onMessageSent }: Props) {
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function sendMessage() {
    if (!inputText.trim()) return
    const msg: ChatMessage = { type: 'chat', text: inputText }
    const link = getLink()
    const sent = link.reliable.send(msg)
    if (!sent) {
      console.warn('Message dropped: reliable channel buffer full')
      return
    }
    onMessageSent(inputText)
    setInputText('')
  }

  return (
    <div className="mt-7 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 shadow-inner">
      <div
        data-testid="chat-messages"
        className="flex h-72 flex-col gap-3 overflow-y-auto p-5"
      >
        {messages.length === 0 ? (
          <div className="mt-20 text-center text-sm text-gray-500">
            {status === 'connected'
              ? 'Connected! Type a message below to start chatting.'
              : 'No messages yet. Establish a connection to start chatting.'}
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`
                flex w-full
                ${m.sender === 'me' ? 'justify-end' : `justify-start`}
              `}
            >
              <div
                className={`
                  max-w-xs rounded-2xl px-4 py-2 text-sm leading-relaxed
                  shadow-lg
                  ${
                    m.sender === 'me'
                      ? `rounded-br-sm bg-gradient-to-br from-indigo-600 to-indigo-500 text-white`
                      : `rounded-bl-sm border border-white/5 bg-white/5 text-gray-200`
                  }
                `}
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex border-t border-white/10 bg-slate-900/90">
        <input
          data-testid="chat-input"
          type="text"
          className="flex-1 border-none bg-transparent p-4 text-sm text-white outline-none"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          disabled={status !== 'connected'}
          placeholder={
            status === 'connected'
              ? 'Type a message...'
              : 'Waiting for connection...'
          }
        />
        <button
          data-testid="send-button"
          className="bg-gradient-to-br from-indigo-600 to-indigo-500 px-6 font-semibold text-white transition-opacity disabled:bg-white/10 disabled:text-white/20"
          onClick={sendMessage}
          disabled={status !== 'connected' || !inputText.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
