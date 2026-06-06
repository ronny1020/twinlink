import { expect, describe, it, beforeAll } from 'bun:test'
import { createTwinLink } from './index'

let latestPeerConnection:
  | {
      triggerDataChannel(channel: Partial<RTCDataChannel>): void
      triggerConnectionStateChange(state: RTCPeerConnectionState): void
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
        triggerDataChannel: (channel: Partial<RTCDataChannel>) => {
          this.ondatachannel?.({
            channel: channel as RTCDataChannel,
          } as RTCDataChannelEvent)
        },
        triggerConnectionStateChange: (state: RTCPeerConnectionState) => {
          this.connectionState = state
          this.onconnectionstatechange?.()
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
        close: () => {},
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
    close() {
      this.connectionState = 'closed'
    }
    onconnectionstatechange: (() => void) | null = null
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
    const channel: Partial<RTCDataChannel> = {
      label: 'reliable',
      readyState: 'open',
      onmessage: null,
      send(data: string | Blob | ArrayBuffer | ArrayBufferView) {
        const ping = JSON.parse(data as string) as {
          __twinlink: 'ping'
          id: string
          sentAt: number
        }

        queueMicrotask(() => {
          if (channel.onmessage) {
            channel.onmessage.call(
              channel as RTCDataChannel,
              {
                data: JSON.stringify({
                  __twinlink: 'pong',
                  id: ping.id,
                  sentAt: ping.sentAt,
                }),
              } as MessageEvent,
            )
          }
        })
      },
    }

    latestPeerConnection?.triggerDataChannel(channel)

    const latency = await link.ping()
    expect(latency).toBeGreaterThanOrEqual(0)
    expect(link.latency).toBe(latency)
    expect(link.jitter).toBe(0)
  })

  it('should close peer connection and data channels when close is called', () => {
    const link = createTwinLink()
    expect(() => link.close()).not.toThrow()
  })

  it('should reject pending pings when close is called', async () => {
    const link = createTwinLink()
    const channel: Partial<RTCDataChannel> = {
      label: 'reliable',
      readyState: 'open',
      onmessage: null,
      send() {
        // Do not respond to simulate pending ping
      },
      close() {},
    }

    latestPeerConnection?.triggerDataChannel(channel)

    const pingPromise = link.ping()
    link.close()

    await expect(pingPromise).rejects.toThrow('Connection closed by client')
  })

  it('should reject pending pings when connection state changes to failed', async () => {
    const link = createTwinLink()
    const channel: Partial<RTCDataChannel> = {
      label: 'reliable',
      readyState: 'open',
      onmessage: null,
      send() {
        // Do not respond to simulate pending ping
      },
      close() {},
    }

    latestPeerConnection?.triggerDataChannel(channel)

    const pingPromise = link.ping()
    latestPeerConnection?.triggerConnectionStateChange('failed')

    await expect(pingPromise).rejects.toThrow(
      'Connection entered state: failed',
    )
  })
})
