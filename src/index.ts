export interface TwinLink<T = unknown> {
  host(): Promise<string>
  join(offer: string): Promise<string>
  connect(answer: string): Promise<void>
  ping(): Promise<number>
  latency: number
  jitter: number
  connectionState: RTCPeerConnectionState
  fast: {
    send(data: T): void
    onMessage: (handler: (data: T) => void) => void
  }
  reliable: {
    send(data: T): void
    onMessage: (handler: (data: T) => void) => void
  }
  onConnectionStateChange: (
    handler: (state: RTCPeerConnectionState) => void,
  ) => void
}

interface SignalData {
  sdp: RTCSessionDescriptionInit
  candidates: RTCIceCandidateInit[]
}

type InternalMessage =
  | { __twinlink: 'ping'; id: string; sentAt: number }
  | { __twinlink: 'pong'; id: string; sentAt: number }

const ICE_GATHERING_TIMEOUT_MS = 15000

export function createTwinLink<T = unknown>(
  config?: RTCConfiguration,
): TwinLink<T> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    ...config,
  })

  let fastChannel: RTCDataChannel | null = null
  let reliableChannel: RTCDataChannel | null = null

  let fastHandler: ((data: T) => void) | null = null
  let reliableHandler: ((data: T) => void) | null = null
  let stateHandler: ((state: RTCPeerConnectionState) => void) | null = null
  let latencyValue = 0
  let jitterValue = 0
  let previousLatency: number | null = null
  const pendingPings = new Map<string, (latency: number) => void>()

  const iceCandidates: RTCIceCandidateInit[] = []

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      iceCandidates.push(event.candidate.toJSON())
    }
  }

  pc.onconnectionstatechange = () => {
    if (stateHandler) stateHandler(pc.connectionState)
  }

  const sendReliable = (data: unknown) => {
    if (reliableChannel?.readyState === 'open') {
      reliableChannel.send(JSON.stringify(data))
      return true
    }
    return false
  }

  const handleInternalMessage = (data: unknown) => {
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
      const resolve = pendingPings.get(message.id)
      if (resolve) {
        pendingPings.delete(message.id)
        const latency = performance.now() - message.sentAt
        jitterValue =
          previousLatency === null ? 0 : Math.abs(latency - previousLatency)
        previousLatency = latency
        latencyValue = latency
        resolve(latency)
      }
      return true
    }

    return false
  }

  const setupChannel = (channel: RTCDataChannel, type: 'fast' | 'reliable') => {
    channel.onmessage = (event) => {
      const data = JSON.parse(event.data) as T
      if (type === 'reliable' && handleInternalMessage(data)) return
      if (type === 'fast' && fastHandler) fastHandler(data)
      if (type === 'reliable' && reliableHandler) reliableHandler(data)
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
        pc.removeEventListener('icegatheringstatechange', check)
      }

      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          cleanup()
          resolve()
        }
      }

      if (pc.iceGatheringState === 'complete') {
        resolve()
      } else {
        pc.addEventListener('icegatheringstatechange', check)
        timeoutId = setTimeout(() => {
          cleanup()
          reject(new Error('Timed out waiting for ICE gathering to complete'))
        }, ICE_GATHERING_TIMEOUT_MS)
      }
    })

  const encode = (data: SignalData): string => btoa(JSON.stringify(data))
  const decode = (token: string): SignalData => JSON.parse(atob(token))

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
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
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
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
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
        }, 5000)

        pendingPings.set(id, (value) => {
          clearTimeout(timeoutId)
          resolve(value)
        })

        channel.send(JSON.stringify({ __twinlink: 'ping', id, sentAt }))
      })

      return latency
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
      send(data: T) {
        if (fastChannel?.readyState === 'open') {
          fastChannel.send(JSON.stringify(data))
        }
      },
      onMessage(handler: (data: T) => void) {
        fastHandler = handler
      },
    },

    reliable: {
      send(data: T) {
        sendReliable(data)
      },
      onMessage(handler: (data: T) => void) {
        reliableHandler = handler
      },
    },

    onConnectionStateChange(handler: (state: RTCPeerConnectionState) => void) {
      stateHandler = handler
    },
  }
}
