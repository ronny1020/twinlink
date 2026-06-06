export interface TwinLink<Fast = unknown, Reliable = unknown> {
  host(): Promise<string>
  join(offer: string): Promise<string>
  connect(answer: string): Promise<void>
  ping(): Promise<number>
  close(): void
  latency: number
  jitter: number
  connectionState: RTCPeerConnectionState
  fast: {
    send(data: Fast): void
    onMessage: (handler: (data: Fast) => void) => () => void
  }
  reliable: {
    send(data: Reliable): boolean
    onMessage: (handler: (data: Reliable) => void) => () => void
  }
  onConnectionStateChange: (
    handler: (state: RTCPeerConnectionState) => void,
  ) => () => void
}

interface SignalData {
  sdp: RTCSessionDescriptionInit
  candidates: RTCIceCandidateInit[]
}

type InternalMessage =
  | { __twinlink: 'ping'; id: string; sentAt: number }
  | { __twinlink: 'pong'; id: string; sentAt: number }

export interface TwinLinkOptions {
  rtc?: RTCConfiguration
  iceGatheringTimeoutMs?: number
  pingTimeoutMs?: number
}

const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 15_000
const DEFAULT_PING_TIMEOUT_MS = 5_000

function encode(data: SignalData): string {
  try {
    return btoa(JSON.stringify(data))
  } catch (e) {
    throw new Error(
      `Failed to encode session data: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    )
  }
}

function decode(token: string): SignalData {
  try {
    const decoded = atob(token.trim())
    return JSON.parse(decoded) as SignalData
  } catch (e) {
    throw new Error(
      `Invalid session token format: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    )
  }
}

export function createTwinLink<Fast = unknown, Reliable = unknown>(
  options?: TwinLinkOptions,
): TwinLink<Fast, Reliable> {
  const iceGatheringTimeoutMs =
    options?.iceGatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS
  const pingTimeoutMs = options?.pingTimeoutMs ?? DEFAULT_PING_TIMEOUT_MS

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    ...options?.rtc,
  })

  let fastChannel: RTCDataChannel | null = null
  let reliableChannel: RTCDataChannel | null = null

  const fastHandlers = new Set<(data: Fast) => void>()
  const reliableHandlers = new Set<(data: Reliable) => void>()
  const stateHandlers = new Set<(state: RTCPeerConnectionState) => void>()

  let latencyValue = 0
  let jitterValue = 0
  let previousLatency: number | null = null

  const pendingPings = new Map<
    string,
    {
      resolve: (latency: number) => void
      reject: (error: Error) => void
    }
  >()

  const iceCandidates: RTCIceCandidateInit[] = []

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      iceCandidates.push(event.candidate.toJSON())
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      for (const [id, handlers] of pendingPings.entries()) {
        handlers.reject(
          new Error(`Connection entered state: ${pc.connectionState}`),
        )
        pendingPings.delete(id)
      }
    }
    for (const handler of stateHandlers) {
      handler(pc.connectionState)
    }
  }

  const sendReliable = (data: unknown): boolean => {
    if (reliableChannel?.readyState === 'open') {
      reliableChannel.send(JSON.stringify(data))
      return true
    }
    return false
  }

  const handleInternalMessage = (data: unknown): boolean => {
    if (
      typeof data !== 'object' ||
      data === null ||
      !('__twinlink' in data) ||
      !('id' in data) ||
      !('sentAt' in data)
    ) {
      return false
    }

    const message = data as InternalMessage
    if (typeof message.id !== 'string' || typeof message.sentAt !== 'number') {
      return false
    }

    if (message.__twinlink === 'ping') {
      sendReliable({
        __twinlink: 'pong',
        id: message.id,
        sentAt: message.sentAt,
      })
      return true
    }

    if (message.__twinlink === 'pong') {
      const handlers = pendingPings.get(message.id)
      if (handlers) {
        pendingPings.delete(message.id)
        const latency = performance.now() - message.sentAt
        jitterValue =
          previousLatency === null ? 0 : Math.abs(latency - previousLatency)
        previousLatency = latency
        latencyValue = latency
        handlers.resolve(latency)
      }
      return true
    }

    return false
  }

  const setupChannel = (channel: RTCDataChannel, type: 'fast' | 'reliable') => {
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Fast | Reliable
        if (type === 'reliable') {
          if (handleInternalMessage(data)) return
          for (const handler of reliableHandlers) {
            handler(data as Reliable)
          }
        } else {
          for (const handler of fastHandlers) {
            handler(data as Fast)
          }
        }
      } catch (e) {
        console.error(`Failed to parse incoming ${type} message:`, e)
      }
    }
  }

  pc.ondatachannel = (event) => {
    const channel = event.channel
    if (channel.label === 'fast') {
      fastChannel = channel
      setupChannel(fastChannel, 'fast')
    } else if (channel.label === 'reliable') {
      reliableChannel = channel
      setupChannel(reliableChannel, 'reliable')
    }
  }

  const waitForIce = () =>
    new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        pc.removeEventListener('icegatheringstatechange', onGathering)
        pc.removeEventListener('connectionstatechange', onConnection)
      }

      const onGathering = () => {
        if (pc.iceGatheringState === 'complete') {
          cleanup()
          resolve()
        }
      }

      const onConnection = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          cleanup()
          reject(
            new Error(`Connection ${pc.connectionState} during ICE gathering`),
          )
        }
      }

      if (pc.iceGatheringState === 'complete') {
        resolve()
        return
      }

      pc.addEventListener('icegatheringstatechange', onGathering)
      pc.addEventListener('connectionstatechange', onConnection)

      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('Timed out waiting for ICE gathering to complete'))
      }, iceGatheringTimeoutMs)
    })

  return {
    async host() {
      fastChannel = pc.createDataChannel('fast', {
        ordered: false,
        maxRetransmits: 0,
      })
      reliableChannel = pc.createDataChannel('reliable', { ordered: true })
      setupChannel(fastChannel, 'fast')
      setupChannel(reliableChannel, 'reliable')

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await waitForIce()

      return encode({
        sdp: pc.localDescription!.toJSON(),
        candidates: iceCandidates,
      })
    },

    async join(offerToken: string) {
      const offerData = decode(offerToken)
      await pc.setRemoteDescription(new RTCSessionDescription(offerData.sdp))
      for (const candidate of offerData.candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.warn('Failed to add ICE candidate:', e)
        }
      }

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await waitForIce()

      return encode({
        sdp: pc.localDescription!.toJSON(),
        candidates: iceCandidates,
      })
    },

    async connect(answerToken: string) {
      const answerData = decode(answerToken)
      await pc.setRemoteDescription(new RTCSessionDescription(answerData.sdp))
      for (const candidate of answerData.candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.warn('Failed to add ICE candidate:', e)
        }
      }
    },

    async ping() {
      const channel = reliableChannel
      if (!channel || channel.readyState !== 'open') {
        throw new Error('Reliable channel is not open')
      }

      const id = crypto.randomUUID()
      const sentAt = performance.now()

      const latency = await new Promise<number>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingPings.delete(id)
          reject(new Error('Timed out waiting for ping response'))
        }, pingTimeoutMs)

        pendingPings.set(id, {
          resolve: (value) => {
            clearTimeout(timeoutId)
            resolve(value)
          },
          reject: (error) => {
            clearTimeout(timeoutId)
            reject(error)
          },
        })

        sendReliable({ __twinlink: 'ping', id, sentAt })
      })

      return latency
    },

    close() {
      if (fastChannel) {
        try {
          fastChannel.close()
        } catch {
          // Ignore errors when closing already-closed channels
        }
        fastChannel = null
      }
      if (reliableChannel) {
        try {
          reliableChannel.close()
        } catch {
          // Ignore errors when closing already-closed channels
        }
        reliableChannel = null
      }
      for (const [id, handlers] of pendingPings.entries()) {
        handlers.reject(new Error('Connection closed by client'))
        pendingPings.delete(id)
      }
      latencyValue = 0
      jitterValue = 0
      previousLatency = null
      try {
        pc.close()
      } catch {
        // Ignore errors when closing already-closed peer connection
      }
    },

    get latency() {
      return latencyValue
    },
    get jitter() {
      return jitterValue
    },
    get connectionState() {
      return pc.connectionState
    },

    fast: {
      send(data: Fast) {
        if (fastChannel?.readyState === 'open') {
          fastChannel.send(JSON.stringify(data))
        }
      },
      onMessage(handler: (data: Fast) => void) {
        fastHandlers.add(handler)
        return () => fastHandlers.delete(handler)
      },
    },

    reliable: {
      send(data: Reliable): boolean {
        return sendReliable(data)
      },
      onMessage(handler: (data: Reliable) => void) {
        reliableHandlers.add(handler)
        return () => reliableHandlers.delete(handler)
      },
    },

    onConnectionStateChange(handler: (state: RTCPeerConnectionState) => void) {
      stateHandlers.add(handler)
      return () => stateHandlers.delete(handler)
    },
  }
}
