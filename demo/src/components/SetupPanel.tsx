import React, { useState } from 'react'
import { getLink, resetLink } from '../core/twinlink'
import { TokenArea } from './TokenArea'

type Props = {
  status: RTCPeerConnectionState
  onReset: () => void
  onError: (msg: string | null) => void
}

export function SetupPanel({ status, onReset, onError }: Props) {
  const [role, setRole] = useState<'none' | 'host' | 'joiner'>('none')
  const [localToken, setLocalToken] = useState('')
  const [remoteToken, setRemoteToken] = useState('')

  async function handleHost() {
    setRole('host')
    onError(null)
    try {
      const offer = await getLink().host()
      setLocalToken(offer)
    } catch (e) {
      console.error('Host failed:', e)
      onError(`Failed to host: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function handleJoin() {
    setRole('joiner')
    onError(null)
  }

  async function handleGenerateAnswer() {
    onError(null)
    try {
      const answer = await getLink().join(remoteToken)
      setLocalToken(answer)
    } catch (e) {
      console.error('Join failed:', e)
      onError(`Failed to join: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleConnect() {
    onError(null)
    try {
      await getLink().connect(remoteToken)
    } catch (e) {
      console.error('Connect failed:', e)
      onError(
        `Failed to connect: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  function handleDisconnect() {
    resetLink()
    setRole('none')
    setLocalToken('')
    setRemoteToken('')
    onReset()
    onError(null)
  }

  if (role === 'none') {
    return (
      <div className="my-10 flex justify-center gap-4">
        <button
          data-testid="host-button"
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 px-6 py-3 font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/35 active:translate-y-0"
          onClick={handleHost}
        >
          Host Session
        </button>
        <button
          data-testid="join-button"
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-semibold text-gray-200 transition-all hover:bg-white/10 active:translate-y-0"
          onClick={handleJoin}
        >
          Join Session
        </button>
      </div>
    )
  }

  if (role === 'host') {
    return (
      <div>
        <TokenArea
          label="1. Copy this offer to joiner:"
          value={localToken}
          readOnly
          testId="offer-token"
          placeholder="Generating offer token..."
        />
        <TokenArea
          label="2. Paste answer from joiner:"
          value={remoteToken}
          onChange={setRemoteToken}
          testId="answer-input"
          placeholder="Paste the answer token here..."
        />
        <div className="flex gap-3">
          <button
            data-testid="connect-button"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 px-6 py-3 font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/35 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleConnect}
            disabled={!remoteToken || status === 'connected'}
          >
            Connect
          </button>
          <button
            data-testid="disconnect-button"
            className="inline-flex items-center justify-center rounded-xl border border-red-500/20 bg-red-500/15 px-6 py-3 font-semibold text-red-300 transition-all hover:bg-red-500/25 hover:text-white"
            onClick={handleDisconnect}
          >
            Disconnect / Reset
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <TokenArea
        label="1. Paste offer from host:"
        value={remoteToken}
        onChange={setRemoteToken}
        testId="offer-input"
        placeholder="Paste the offer token here..."
      />
      <button
        data-testid="generate-answer-button"
        className="mb-4 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 px-6 py-3 font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/35 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={handleGenerateAnswer}
        disabled={!remoteToken || !!localToken}
      >
        Generate Answer
      </button>

      {localToken && (
        <TokenArea
          label="2. Copy this answer to host:"
          value={localToken}
          readOnly
          testId="answer-token"
        />
      )}

      <div>
        <button
          className="inline-flex items-center justify-center rounded-xl border border-red-500/20 bg-red-500/15 px-6 py-3 font-semibold text-red-300 transition-all hover:bg-red-500/25 hover:text-white"
          onClick={handleDisconnect}
        >
          Disconnect / Reset
        </button>
      </div>
    </div>
  )
}
