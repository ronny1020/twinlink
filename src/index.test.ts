import { expect, describe, it, beforeAll } from 'bun:test'
import { createTwinLink } from './index'

let latestPeerConnection:
  | {
      triggerDataChannel(channel: RTCDataChannel): void
    }
  | undefined

// Mock WebRTC APIs
beforeAll(() => {
  // @ts-expect-error - Mocking global for testing
  globalThis.RTCPeerConnection = class {
    connectionState = 'new'
    iceGatheringState = 'new'
    ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null
    constructor() {
      latestPeerConnection = {
        triggerDataChannel: (channel: RTCDataChannel) => {
          this.ondatachannel?.({ channel } as RTCDataChannelEvent)
        },
      }
    }
    createDataChannel() {
      return {
        label: 'mock',
        onmessage: null,
        onopen: null,
        onclose: null,
        readyState: 'connecting',
        send: () => {},
      }
    }
    createOffer() {
      return Promise.resolve({
        type: 'offer',
        sdp: '',
      } as RTCSessionDescriptionInit)
    }
    createAnswer() {
      return Promise.resolve({
        type: 'answer',
        sdp: '',
      } as RTCSessionDescriptionInit)
    }
    setLocalDescription() {
      return Promise.resolve()
    }
    setRemoteDescription() {
      return Promise.resolve()
    }
    addIceCandidate() {
      return Promise.resolve()
    }
    addEventListener() {}
    removeEventListener() {}
  }

  // @ts-expect-error - Mocking global for testing
  globalThis.RTCSessionDescription = class {
    constructor(init: RTCSessionDescriptionInit) {
      Object.assign(this, init)
    }
    toJSON() {
      return this
    }
  }

  // @ts-expect-error - Mocking global for testing
  globalThis.RTCIceCandidate = class {
    constructor(init: RTCIceCandidateInit) {
      Object.assign(this, init)
    }
    toJSON() {
      return this
    }
  }
})

describe('TwinLink Initialization', () => {
  it('should create a TwinLink instance', () => {
    const link = createTwinLink()
    expect(link).toBeDefined()
    expect(link.host).toBeTypeOf('function')
    expect(link.join).toBeTypeOf('function')
    expect(link.connect).toBeTypeOf('function')
  })

  it('should have correct initial state', () => {
    const link = createTwinLink()
    expect(link.connectionState).toBe('new')
    expect(link.latency).toBe(0)
    expect(link.jitter).toBe(0)
  })

  it('should measure ping latency over the reliable channel', async () => {
    const link = createTwinLink()
    const channel = {
      label: 'reliable',
      readyState: 'open',
      onmessage: null as ((event: MessageEvent<string>) => void) | null,
      send(data: string) {
        const ping = JSON.parse(data) as {
          __twinlink: 'ping'
          id: string
          sentAt: number
        }

        queueMicrotask(() => {
          channel.onmessage?.({
            data: JSON.stringify({
              __twinlink: 'pong',
              id: ping.id,
              sentAt: ping.sentAt,
            }),
          } as MessageEvent<string>)
        })
      },
    }

    latestPeerConnection?.triggerDataChannel(channel as RTCDataChannel)

    const latency = await link.ping()
    expect(latency).toBeGreaterThanOrEqual(0)
    expect(link.latency).toBe(latency)
    expect(link.jitter).toBe(0)
  })
})
