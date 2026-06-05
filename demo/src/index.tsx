import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { createTwinLink, type TwinLink } from '../../src/index'

type ChatMessage = {
  type: 'chat'
  text: string
}

type Message = {
  id: string
  text: string
  sender: 'me' | 'them'
  timestamp: number
}

const App = () => {
  const [role, setRole] = useState<'none' | 'host' | 'joiner'>('none')
  const [token, setToken] = useState('')
  const [remoteToken, setRemoteToken] = useState('')
  const [status, setStatus] = useState<RTCPeerConnectionState>('new')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const linkRef = useRef<TwinLink<ChatMessage>>(null)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const noIce = urlParams.has('noice')

    linkRef.current = createTwinLink<ChatMessage>(
      noIce ? { iceServers: [] } : undefined,
    )
    linkRef.current.onConnectionStateChange((state) => {
      setStatus(state)
    })
    linkRef.current.reliable.onMessage((msg) => {
      if (msg.type === 'chat') {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            text: msg.text,
            sender: 'them',
            timestamp: Date.now(),
          },
        ])
      }
    })
  }, [])

  const handleHost = async () => {
    console.log('handleHost called')
    setRole('host')
    const offer = await linkRef.current!.host()
    console.log('Host offer generated')
    setToken(offer)
  }

  const handleJoin = () => {
    console.log('handleJoin called')
    setRole('joiner')
  }

  const handleGenerateAnswer = async () => {
    console.log('handleGenerateAnswer called')
    const answer = await linkRef.current!.join(remoteToken)
    console.log('Joiner answer generated')
    setToken(answer)
  }

  const handleConnect = async () => {
    console.log('handleConnect called, token length:', remoteToken.length)
    await linkRef.current!.connect(remoteToken)
    console.log('handleConnect finished')
  }

  const sendMessage = () => {
    if (!inputText.trim()) return
    const msg: ChatMessage = { type: 'chat', text: inputText }
    linkRef.current!.reliable.send(msg)
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        text: inputText,
        sender: 'me',
        timestamp: Date.now(),
      },
    ])
    setInputText('')
  }

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'sans-serif',
        maxWidth: '600px',
        margin: '0 auto',
      }}
    >
      <h1>TwinLink Chat Demo</h1>
      <p>
        Status: <strong>{status}</strong>
      </p>

      {role === 'none' && (
        <div>
          <button onClick={handleHost}>Host Session</button>
          <button onClick={handleJoin} style={{ marginLeft: '10px' }}>
            Join Session
          </button>
        </div>
      )}

      {role === 'host' && (
        <div style={{ marginTop: '20px' }}>
          <h3>1. Copy this offer to joiner:</h3>
          <textarea
            readOnly
            value={token}
            style={{ width: '100%', height: '100px' }}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <h3>2. Paste answer from joiner:</h3>
          <textarea
            value={remoteToken}
            onChange={(e) => setRemoteToken(e.target.value)}
            style={{ width: '100%', height: '100px' }}
          />
          <button onClick={handleConnect} style={{ marginTop: '10px' }}>
            Connect
          </button>
        </div>
      )}

      {role === 'joiner' && (
        <div style={{ marginTop: '20px' }}>
          <h3>1. Paste offer from host:</h3>
          <textarea
            value={remoteToken}
            onChange={(e) => setRemoteToken(e.target.value)}
            style={{ width: '100%', height: '100px' }}
          />
          <button onClick={handleGenerateAnswer} style={{ marginTop: '10px' }}>
            Generate Answer
          </button>
          {token && (
            <>
              <h3>2. Copy this answer to host:</h3>
              <textarea
                readOnly
                value={token}
                style={{ width: '100%', height: '100px' }}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: '30px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '300px',
            overflowY: 'auto',
            padding: '10px',
            background: '#f9f9f9',
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                textAlign: m.sender === 'me' ? 'right' : 'left',
                margin: '5px 0',
              }}
            >
              <span
                style={{
                  background: m.sender === 'me' ? '#007bff' : '#e4e6eb',
                  color: m.sender === 'me' ? 'white' : 'black',
                  padding: '8px 12px',
                  borderRadius: '18px',
                  display: 'inline-block',
                  maxWidth: '80%',
                }}
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', borderTop: '1px solid #ccc' }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            disabled={status !== 'connected'}
            placeholder={
              status === 'connected'
                ? 'Type a message...'
                : 'Waiting for connection...'
            }
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={status !== 'connected'}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: '#007bff',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<App />)
}
