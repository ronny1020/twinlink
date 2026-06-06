import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { createTwinLink, type TwinLink } from 'twinlink'

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

function isChatMessage(msg: unknown): msg is ChatMessage {
  return !!(
    msg &&
    typeof msg === 'object' &&
    'type' in msg &&
    msg.type === 'chat' &&
    'text' in msg &&
    typeof msg.text === 'string'
  )
}

const App = () => {
  const [role, setRole] = useState<'none' | 'host' | 'joiner'>('none')
  const [token, setToken] = useState('')
  const [remoteToken, setRemoteToken] = useState('')
  const [status, setStatus] = useState<RTCPeerConnectionState>('new')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')

  // Metrics
  const [latency, setLatency] = useState(0)
  const [jitter, setJitter] = useState(0)
  const [autoPing, setAutoPing] = useState(false)

  // Copy indicator states
  const [copiedLocal, setCopiedLocal] = useState(false)

  const linkRef = useRef<TwinLink<unknown, ChatMessage>>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const initTwinLink = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const noIce = urlParams.has('noice')

    linkRef.current = createTwinLink<unknown, ChatMessage>(
      noIce ? { rtc: { iceServers: [] } } : undefined,
    )
    linkRef.current.onConnectionStateChange((state) => {
      setStatus(state)
    })
    linkRef.current.reliable.onMessage((msg: unknown) => {
      if (isChatMessage(msg)) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            text: msg.text,
            sender: 'them',
            timestamp: Date.now(),
          },
        ])
      }
    })
  }

  useEffect(() => {
    initTwinLink()

    return () => {
      if (linkRef.current) {
        linkRef.current.close()
      }
    }
  }, [])

  // Auto scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-Ping Interval
  useEffect(() => {
    if (!autoPing || status !== 'connected' || !linkRef.current) return

    const interval = setInterval(async () => {
      try {
        await linkRef.current?.ping()
        setLatency(linkRef.current?.latency || 0)
        setJitter(linkRef.current?.jitter || 0)
      } catch (e) {
        console.error('Auto ping failed:', e)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [autoPing, status])

  const handleHost = async () => {
    setRole('host')
    const offer = await linkRef.current!.host()
    setToken(offer)
  }

  const handleJoin = () => {
    setRole('joiner')
  }

  const handleGenerateAnswer = async () => {
    const answer = await linkRef.current!.join(remoteToken)
    setToken(answer)
  }

  const handleConnect = async () => {
    await linkRef.current!.connect(remoteToken)
  }

  const handleDisconnect = () => {
    if (linkRef.current) {
      linkRef.current.close()
    }

    // Reinitialize
    initTwinLink()

    // Reset UI state
    setRole('none')
    setToken('')
    setRemoteToken('')
    setMessages([])
    setInputText('')
    setLatency(0)
    setJitter(0)
    setAutoPing(false)
  }

  const handlePing = async () => {
    if (!linkRef.current || status !== 'connected') return
    try {
      await linkRef.current.ping()
      setLatency(linkRef.current.latency)
      setJitter(linkRef.current.jitter)
    } catch (e) {
      console.error('Ping failed:', e)
    }
  }

  const sendMessage = () => {
    if (!inputText.trim()) return
    const msg: ChatMessage = { type: 'chat', text: inputText }
    const sent = linkRef.current!.reliable.send(msg)
    if (!sent) {
      console.warn('Message dropped: reliable channel buffer full')
      return
    }
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: inputText,
        sender: 'me',
        timestamp: Date.now(),
      },
    ])
    setInputText('')
  }

  const copyToClipboard = async (text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedLocal(true)
      setTimeout(() => setCopiedLocal(false), 2000)
    } catch (err) {
      console.error('Failed to copy token:', err)
    }
  }

  return (
    <div className="app-container">
      <style>{`
        body {
          background: #0b0f19;
          color: #f3f4f6;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          margin: 0;
          padding: 0;
        }
        .app-container {
          max-width: 750px;
          margin: 40px auto;
          padding: 0 16px;
        }
        .panel {
          background: rgba(17, 24, 39, 0.7);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 28px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          margin-bottom: 24px;
        }
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 18px;
          margin-bottom: 20px;
        }
        .header-title {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .status-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.04);
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .status-dot.new { background: #9ca3af; }
        .status-dot.connecting {
          background: #f59e0b;
          animation: pulse-warn 1.5s infinite ease-in-out;
        }
        .status-dot.connected {
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
          animation: pulse-success 2s infinite ease-in-out;
        }
        .status-dot.closed, .status-dot.failed {
          background: #ef4444;
        }
        @keyframes pulse-warn {
          0% { transform: scale(0.9); opacity: 0.4; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.4; }
        }
        @keyframes pulse-success {
          0% { transform: scale(0.9); opacity: 0.5; box-shadow: 0 0 4px #10b981; }
          50% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 10px #10b981; }
          100% { transform: scale(0.9); opacity: 0.5; box-shadow: 0 0 4px #10b981; }
        }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .metric-card {
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 14px;
          padding: 14px;
          text-align: center;
          transition: border-color 0.2s, transform 0.2s;
        }
        .metric-card:hover {
          border-color: rgba(99, 102, 241, 0.25);
          transform: translateY(-2px);
        }
        .metric-value {
          font-size: 22px;
          font-weight: 700;
          color: #f9fafb;
          margin-top: 4px;
        }
        .metric-label {
          font-size: 11px;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .setup-actions {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin: 40px 0;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 24px;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          font-size: 14px;
          gap: 8px;
        }
        .btn-primary {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
          transform: translateY(-1px);
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.06);
          color: #e5e7eb;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .btn-danger {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }
        .btn-danger:hover {
          background: rgba(239, 68, 68, 0.25);
          color: white;
        }
        .btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }
        .token-title {
          font-size: 14px;
          font-weight: 600;
          margin: 16px 0 6px 0;
          color: #c084fc;
        }
        .textarea-wrapper {
          position: relative;
          margin-bottom: 18px;
        }
        .token-area {
          width: 100%;
          height: 90px;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 12px 64px 12px 12px;
          color: #d1d5db;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          resize: none;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .token-area:focus {
          border-color: rgba(99, 102, 241, 0.6);
        }
        .copy-btn {
          position: absolute;
          right: 8px;
          top: 8px;
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.3);
          color: #a5b4fc;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .copy-btn:hover {
          background: rgba(99, 102, 241, 0.3);
          color: white;
        }
        .chat-container {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.4);
          box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .chat-messages {
          height: 280px;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .message-row {
          display: flex;
          width: 100%;
        }
        .message-row.me {
          justify-content: flex-end;
        }
        .message-row.them {
          justify-content: flex-start;
        }
        .message-bubble {
          max-width: 70%;
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.4;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .message-row.me .message-bubble {
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          border-bottom-right-radius: 4px;
        }
        .message-row.them .message-bubble {
          background: rgba(255, 255, 255, 0.07);
          color: #e5e7eb;
          border-bottom-left-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.04);
        }
        .chat-input-bar {
          display: flex;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(17, 24, 39, 0.9);
        }
        .chat-input {
          flex: 1;
          background: transparent;
          border: none;
          padding: 16px;
          color: white;
          outline: none;
          font-size: 14px;
        }
        .chat-send-btn {
          padding: 0 24px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          color: white;
          border: none;
          cursor: pointer;
          font-weight: 600;
          transition: opacity 0.2s;
        }
        .chat-send-btn:hover {
          opacity: 0.9;
        }
        .chat-send-btn:disabled {
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.2);
          cursor: not-allowed;
        }
        .ping-control-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
          margin-top: 16px;
          font-size: 13px;
        }
        .checkbox-container {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
        }
      `}</style>

      <div className="panel">
        <div className="header-container">
          <h1 className="header-title">TwinLink Chat Demo</h1>
          <div className="status-badge">
            <span className={`status-dot ${status}`} />
            <span>
              Status: <strong>{status}</strong>
            </span>
          </div>
        </div>

        {/* Real-time Metrics */}
        {status === 'connected' && (
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Latency</div>
              <div className="metric-value">
                {latency > 0 ? `${latency.toFixed(1)} ms` : '--'}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Jitter</div>
              <div className="metric-value">
                {jitter > 0 ? `${jitter.toFixed(1)} ms` : '--'}
              </div>
            </div>
            <div
              className="metric-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <div className="metric-label" style={{ marginBottom: '6px' }}>
                Network Profile
              </div>
              <div
                className="metric-value"
                style={{
                  fontSize: '15px',
                  color:
                    latency < 15 && latency > 0
                      ? '#10b981'
                      : latency < 50 && latency > 0
                        ? '#f59e0b'
                        : '#9ca3af',
                }}
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

        {/* Setup actions for none role */}
        {role === 'none' && (
          <div className="setup-actions">
            <button className="btn btn-primary" onClick={handleHost}>
              Host Session
            </button>
            <button className="btn btn-secondary" onClick={handleJoin}>
              Join Session
            </button>
          </div>
        )}

        {/* Host role UI */}
        {role === 'host' && (
          <div>
            <div className="token-title">1. Copy this offer to joiner:</div>
            <div className="textarea-wrapper">
              <textarea
                className="token-area"
                readOnly
                value={token}
                placeholder="Generating offer token..."
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
              <button
                className="copy-btn"
                disabled={!token}
                onClick={() => copyToClipboard(token)}
              >
                {copiedLocal ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="token-title">2. Paste answer from joiner:</div>
            <div className="textarea-wrapper">
              <textarea
                className="token-area"
                value={remoteToken}
                onChange={(e) => setRemoteToken(e.target.value)}
                placeholder="Paste the answer token here..."
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-primary"
                onClick={handleConnect}
                disabled={!remoteToken || status === 'connected'}
              >
                Connect
              </button>
              <button className="btn btn-danger" onClick={handleDisconnect}>
                Disconnect / Reset
              </button>
            </div>
          </div>
        )}

        {/* Joiner role UI */}
        {role === 'joiner' && (
          <div>
            <div className="token-title">1. Paste offer from host:</div>
            <div className="textarea-wrapper">
              <textarea
                className="token-area"
                value={remoteToken}
                onChange={(e) => setRemoteToken(e.target.value)}
                placeholder="Paste the offer token here..."
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleGenerateAnswer}
              disabled={!remoteToken || !!token}
              style={{ marginBottom: '16px' }}
            >
              Generate Answer
            </button>

            {token && (
              <div>
                <div className="token-title">2. Copy this answer to host:</div>
                <div className="textarea-wrapper">
                  <textarea
                    className="token-area"
                    readOnly
                    value={token}
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                  <button
                    className="copy-btn"
                    onClick={() => copyToClipboard(token)}
                  >
                    {copiedLocal ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div>
              <button className="btn btn-danger" onClick={handleDisconnect}>
                Disconnect / Reset
              </button>
            </div>
          </div>
        )}

        {/* Chat window */}
        <div style={{ marginTop: '28px' }}>
          <div className="chat-container">
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div
                  style={{
                    color: '#6b7280',
                    textAlign: 'center',
                    marginTop: '80px',
                    fontSize: '14px',
                  }}
                >
                  {status === 'connected'
                    ? 'Connected! Type a message below to start chatting.'
                    : 'No messages yet. Establish a connection to start chatting.'}
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`message-row ${m.sender}`}>
                    <div className="message-bubble">
                      <div>{m.text}</div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-bar">
              <input
                type="text"
                className="chat-input"
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
                className="chat-send-btn"
                onClick={sendMessage}
                disabled={status !== 'connected' || !inputText.trim()}
              >
                Send
              </button>
            </div>
          </div>

          {/* Connection diagnostics / pings */}
          {status === 'connected' && (
            <div className="ping-control-row">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={autoPing}
                  onChange={(e) => setAutoPing(e.target.checked)}
                />
                Auto-ping (2s)
              </label>
              <button className="btn btn-secondary btn-sm" onClick={handlePing}>
                Ping Now
              </button>
            </div>
          )}
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
