/**
 * Options for configuring a TwinLink instance.
 */
export interface TwinLinkOptions {
  /**
   * Optional WebRTC configuration.
   * Use this to provide custom STUN/TURN servers.
   */
  rtc?: RTCConfiguration
  /**
   * Timeout in milliseconds to wait for ICE gathering to complete before generating a token.
   * Default: 30,000ms.
   */
  iceGatheringTimeoutMs?: number
  /**
   * Timeout in milliseconds for ping responses.
   * Default: 5,000ms.
   */
  pingTimeoutMs?: number
}

/**
 * A TwinLink instance representing a 1-on-1 peer connection.
 * @template Fast - The type of messages sent over the unreliable/unordered channel.
 * @template Reliable - The type of messages sent over the reliable/ordered channel.
 */
export interface TwinLink<Fast = unknown, Reliable = unknown> {
  /**
   * Initializes the host side of the connection.
   * Creates a WebRTC offer and waits for ICE gathering.
   * @returns A base64 offer token to be sent to the joiner.
   */
  host(): Promise<string>
  /**
   * Initializes the joiner side of the connection using an offer token.
   * Creates a WebRTC answer and waits for ICE gathering.
   * @param offer - The base64 offer token from the host.
   * @returns A base64 answer token to be sent back to the host.
   */
  join(offer: string): Promise<string>
  /**
   * Completes the connection flow on the host side using an answer token.
   * @param answer - The base64 answer token from the joiner.
   */
  connect(answer: string): Promise<void>
  /**
   * Measures the round-trip time (RTT) to the peer.
   * Updates `latency` and `jitter` properties on success.
   * @returns A promise resolving to the RTT in milliseconds.
   * @throws Error if the reliable channel is not open.
   */
  ping(): Promise<number>
  /**
   * Closes all data channels and the peer connection.
   * Resets metrics to 0.
   */
  close(): void
  /**
   * The last measured round-trip time in milliseconds.
   */
  latency: number
  /**
   * The variation in round-trip time between the last two measurements.
   */
  jitter: number
  /**
   * The current state of the underlying RTCPeerConnection.
   */
  connectionState: RTCPeerConnectionState
  /**
   * Methods for the unreliable, unordered "fast" channel.
   * Suitable for data where occasional loss or out-of-order arrival is acceptable (e.g., positions).
   */
  fast: {
    /**
     * Sends data over the fast channel.
     * Drops silently if the channel is not open.
     */
    send(data: Fast): void
    /**
     * Registers a listener for incoming messages on the fast channel.
     * @returns An unsubscribe function.
     */
    onMessage: (handler: (data: Fast) => void) => () => void
  }
  /**
   * Methods for the reliable, ordered "reliable" channel.
   * Suitable for data that must arrive intact and in order (e.g., chat).
   */
  reliable: {
    /**
     * Sends data over the reliable channel.
     * @returns true if the data was buffered, false if the channel is not open.
     */
    send(data: Reliable): boolean
    /**
     * Registers a listener for incoming messages on the reliable channel.
     * @returns An unsubscribe function.
     */
    onMessage: (handler: (data: Reliable) => void) => () => void
  }
  /**
   * Registers a listener for connection state changes.
   * @returns An unsubscribe function.
   */
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

const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 30_000
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

/**
 * Creates a new TwinLink instance.
 * @template Fast - The type of messages sent over the unreliable/unordered channel.
 * @template Reliable - The type of messages sent over the reliable/ordered channel.
 * @param options - Configuration options.
 * @returns A TwinLink instance.
 */
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

  function sendReliable(data: unknown): boolean {
    if (reliableChannel?.readyState === 'open') {
      reliableChannel.send(JSON.stringify(data))
      return true
    }
    return false
  }

  function handleInternalMessage(data: unknown): boolean {
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

  function setupChannel(channel: RTCDataChannel, type: 'fast' | 'reliable') {
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

  function waitForIce() {
    return new Promise<void>((resolve) => {
      const timeoutMs = iceGatheringTimeoutMs
      const timer = setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', onStateChange)
        console.warn(
          `ICE gathering timed out after ${timeoutMs}ms. Proceeding with ${iceCandidates.length} candidates.`,
        )
        resolve()
      }, timeoutMs)

      function onStateChange() {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer)
          pc.removeEventListener('icegatheringstatechange', onStateChange)
          resolve()
        }
      }

      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer)
        resolve()
      } else {
        pc.addEventListener('icegatheringstatechange', onStateChange)
      }
    })
  }

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
