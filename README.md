# TwinLink

A lightweight toolkit for creating direct **1-on-1 browser-to-browser connections** using WebRTC Data Channels.

Designed for:

- Multiplayer games
- File transfer
- Chat
- Remote control
- Device pairing
- Local-first applications
- AI agent-generated apps served as static files

No application server required after connection is established.

---

## Goals

### Simple

```ts
import { createTwinLink } from 'twinlink'

const link = createTwinLink()

// Host peer: generate an offer token
const offer = await link.host()

// Joiner peer: join with the offer, get back an answer token
const answer = await link.join(offer)

// Host peer: finalize the connection with the answer token
await link.connect(answer)
```

No SDP, ICE, or WebRTC knowledge required.

---

### 1-on-1 Only

TwinLink intentionally focuses on:

```txt
1 Host
1 Joiner
```

Not:

- Rooms
- Matchmaking
- Mesh networking
- Group calls

This keeps the API small and predictable.

---

### Transport Agnostic Signaling

TwinLink only generates and consumes connection tokens.

Users decide how to exchange them:

- Copy & paste
- URL parameters
- QR codes
- Discord
- WebSocket
- Firebase
- Supabase
- Any custom transport

TwinLink does not provide signaling infrastructure.

---

## Installation

```bash
npm install twinlink
# or
bun add twinlink
```

---

## Core Features

### Direct P2P Connection

```ts
import { createTwinLink } from 'twinlink'

// --- Peer A (Host) ---
const hostLink = createTwinLink()
const offer = await hostLink.host()
// Exchange `offer` to Peer B via any channel (copy/paste, WebSocket, etc.)

// --- Peer B (Joiner) ---
const joinerLink = createTwinLink()
const answer = await joinerLink.join(offer)
// Exchange `answer` back to Peer A

// --- Peer A (Host) ---
await hostLink.connect(answer)
// Both peers are now connected
```

---

### Fast Channel

Unreliable, UDP-like delivery. Best for high-frequency updates where losing a packet is acceptable.

Optimized for:

- Player movement
- Controller input
- Physics updates
- Position synchronization

```ts
// Send
link.fast.send({ x: 10, y: 20 })

// Receive
const unsubscribe = link.fast.onMessage((data) => {
  console.log('received:', data)
})

// Stop listening
unsubscribe()
```

Internally uses:

```ts
{
  ordered: false,
  maxRetransmits: 0
}
```

---

### Reliable Channel

Guaranteed, ordered delivery. Best for messages that must never be lost.

Optimized for:

- Chat
- Inventory
- Game events
- State changes
- File transfer metadata

```ts
// Send — returns false if the channel is not open
const sent = link.reliable.send({ type: 'chat', text: 'hello' })

// Receive
const unsubscribe = link.reliable.onMessage((data) => {
  console.log('received:', data)
})

// Stop listening
unsubscribe()
```

---

### Network Telemetry

```ts
const rtt = await link.ping()

link.latency // RTT in milliseconds (last ping)
link.jitter // Variation in latency between pings
link.connectionState // RTCPeerConnectionState
```

Track connection state changes:

```ts
const unsubscribe = link.onConnectionStateChange((state) => {
  console.log('Connection state:', state)
  // 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'
})

// Stop listening
unsubscribe()
```

Useful for displaying network quality in applications.

---

### Typed Messages

The two channels can carry independent message types via `createTwinLink<Fast, Reliable>()`.

```ts
import { createTwinLink } from 'twinlink'

type FastMessage = { x: number; y: number }
type ReliableMessage =
  | { type: 'chat'; text: string }
  | { type: 'death'; playerId: string }

const link = createTwinLink<FastMessage, ReliableMessage>()

link.fast.onMessage((msg) => {
  // msg.x and msg.y are fully typed
})

link.reliable.onMessage((event) => {
  if (event.type === 'chat') {
    // event.text is fully typed
  }
})
```

If both channels share the same message shape, pass the same type for both generics:

```ts
type Msg = { type: string; payload: unknown }
const link = createTwinLink<Msg, Msg>()
```

---

### Configuration

```ts
import { createTwinLink, TwinLinkOptions } from 'twinlink'

const options: TwinLinkOptions = {
  iceGatheringTimeoutMs: 10_000, // default: 5 000
  pingTimeoutMs: 3_000, // default:  5 000
  rtc: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:my-turn-server.com', username: 'user', credential: 'pass' },
    ],
  },
}

const link = createTwinLink(options)
```

---

### AI Agent Hosting

TwinLink is a natural fit for apps generated and served by AI coding agents such as Claude, Cursor, or any tool that produces self-contained HTML files.

Because TwinLink has no server-side component, a complete multiplayer or remote-control app is a **single static HTML file**. An agent can write the file, host it on any static file server (GitHub Pages, a CDN, even `python -m http.server`), and two browsers can connect directly — no backend ever needed.

A typical agent workflow:

1. **Agent writes** a self-contained `index.html` that imports TwinLink from a CDN.
2. **Agent hosts** the file on any static host (or serves it locally).
3. **User A** opens the page and copies the offer token.
4. **User B** opens the same page, pastes the offer, and gets back an answer token.
5. **User A** pastes the answer — both peers are live.

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Agent-generated app</title>
  </head>
  <body>
    <script type="module">
      import { createTwinLink } from 'https://cdn.jsdelivr.net/npm/twinlink/+esm'

      const link = createTwinLink()

      // Host side: generate an offer and display it
      const offer = await link.host()
      document.getElementById('offer').textContent = offer

      // Once the remote peer pastes their answer token:
      document.getElementById('connect').onclick = async () => {
        const answer = document.getElementById('answer').value
        await link.connect(answer)
      }

      link.reliable.onMessage((msg) => {
        console.log('received:', msg)
      })
    </script>

    <pre id="offer"></pre>
    <textarea id="answer" placeholder="Paste answer token here"></textarea>
    <button id="connect">Connect</button>
  </body>
</html>
```

Because the connection token is just a string, agents can also pre-wire the exchange through a URL parameter, a QR code printed on the page, or any other mechanism — without touching a server.

---

### Connection Teardown

```ts
link.close()
```

Cleanly closes the peer connection and all active data channels, immediately rejects any pending ping promises, resets latency and jitter to `0`, and frees browser resources.

---

## Non-Goals

TwinLink will not provide:

### Signaling Servers

No:

- WebSocket server
- Firebase integration
- Supabase integration

Users can build adapters separately.

---

### TURN Infrastructure

TwinLink uses public STUN servers by default.

It does not provide TURN servers.

Applications requiring guaranteed connectivity across all NAT configurations should configure their own TURN service via the `rtc` option.

---

### Multiplayer Rooms

Not planned.

If users need:

```txt
3+ players
```

they should use another solution.

TwinLink is intentionally optimized for:

```txt
1 ↔ 1
```

---

## Known Limitations

### NAT Traversal

Some network combinations cannot establish a direct connection without TURN.

TwinLink cannot guarantee connectivity in all environments.

---

### Mobile Backgrounding

Mobile browsers may suspend or disconnect WebRTC connections when running in the background.

---

### Host Disconnect

If the host disconnects:

```txt
Session Ends
```

Host migration is out of scope.

---

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, testing, and build instructions.

---

## Example API

```ts
import { createTwinLink } from 'twinlink'

type FastMsg = { x: number; y: number }
type ReliableMsg = { type: 'chat'; text: string }

// ─── Peer A: Host ────────────────────────────────────────────────────────────
const hostLink = createTwinLink<FastMsg, ReliableMsg>()

hostLink.onConnectionStateChange((state) => {
  console.log('Host connection state:', state)
})

hostLink.reliable.onMessage((data) => {
  console.log('Host received:', data)
})

const offer = await hostLink.host()
// Send `offer` to Peer B via any out-of-band channel

// ─── Peer B: Joiner ──────────────────────────────────────────────────────────
const joinerLink = createTwinLink<FastMsg, ReliableMsg>()

joinerLink.reliable.onMessage((data) => {
  console.log('Joiner received:', data)
})

const answer = await joinerLink.join(offer)
// Send `answer` back to Peer A

// ─── Peer A: Finalize ────────────────────────────────────────────────────────
await hostLink.connect(answer)

// Both peers are now connected — send messages on either channel
hostLink.fast.send({ x: 100, y: 200 })

const sent = hostLink.reliable.send({ type: 'chat', text: 'hello' })
if (!sent) console.warn('reliable channel not open yet')

// Measure latency
const rtt = await hostLink.ping()
console.log(`RTT: ${rtt.toFixed(1)} ms`)

// Teardown connection when finished
hostLink.close()
joinerLink.close()
```

---

## Positioning

**Not** another WebRTC wrapper.

**Not** another signaling framework.

TwinLink is:

> A focused 1-on-1 peer connection toolkit that makes direct browser-to-browser communication feel as simple as using a WebSocket.
