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

  const iceCandidates: RTCIceCandidateInit[] = []

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      iceCandidates.push(event.candidate.toJSON())
    }
  }

  pc.onconnectionstatechange = () => {
    if (stateHandler) stateHandler(pc.connectionState)
  }

  const setupChannel = (channel: RTCDataChannel, type: 'fast' | 'reliable') => {
    channel.onmessage = (event) => {
      const data = JSON.parse(event.data) as T
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
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve()
      } else {
        const check = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', check)
            resolve()
          }
        }
        pc.addEventListener('icegatheringstatechange', check)
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
      // Simple ping-pong could be implemented here via data channel
      // For now returning 0 as placeholder
      return 0
    },

    get latency() {
      return 0
    },
    get jitter() {
      return 0
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
        if (reliableChannel?.readyState === 'open') {
          reliableChannel.send(JSON.stringify(data))
        }
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
