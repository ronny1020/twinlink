# TwinLink

A lightweight toolkit for creating direct **1-on-1 browser-to-browser connections** using WebRTC Data Channels.

Designed for:

- Multiplayer games
- File transfer
- Chat
- Remote control
- Device pairing
- Local-first applications

No application server required after connection is established.

---

## Goals

### Simple

```ts
const host = await twinlink.host()

const join = await twinlink.join(host)

await twinlink.connect(join)
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

Example:

```ts
const offer = await twinlink.host()

const answer = await twinlink.join(offer)

await twinlink.connect(answer)
```

TwinLink does not provide signaling infrastructure.

---

## Core Features

### Direct P2P Connection

```ts
const offer = await twinlink.host()
const answer = await twinlink.join(offer)

await twinlink.connect(answer)
```

---

### Fast Channel

Unreliable, UDP-like delivery.

Optimized for:

- Player movement
- Controller input
- Physics updates
- Position synchronization

```ts
link.fast.send(data)
```

Internally:

```ts
{
  ordered: false,
  maxRetransmits: 0
}
```

---

### Reliable Channel

Guaranteed delivery.

Optimized for:

- Chat
- Inventory
- Game events
- State changes
- File transfer metadata

```ts
link.reliable.send(data)
```

---

### Network Telemetry

```ts
await link.ping()

link.latency
link.jitter
link.connectionState
```

Useful for displaying network quality in applications.

---

### Typed Messages

```ts
type Events =
  | { type: 'move'; x: number; y: number }
  | { type: 'death'; playerId: string }

const link = createTwinLink<Events>()
```

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

TwinLink may use public STUN servers by default.

It does not provide TURN servers.

Applications requiring guaranteed connectivity should configure their own TURN service.

---

### Multiplayer Rooms

Not planned.

If users need:

```txt
3+
players
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

TwinLink is built with [Bun](https://bun.sh).

### Installation

```bash
bun install
```

### Running the Demo

The demo is a separate workspace that showcases a 1-on-1 chat.

```bash
# Run from root
bun run demo

# Or from demo folder
cd demo && bun run start
```

### Testing

TwinLink uses `bun test` for unit tests and Bun's experimental `WebView` for E2E tests.

```bash
bun test
```

### Build

To compile the library for Node.js and other environments:

```bash
bun run build
```

---

## Example API

```ts
import { createTwinLink } from 'twinlink'

const link = createTwinLink()

// Host
const offer = await link.host()

// Joiner
const answer = await link.join(offer)

// Host
await link.connect(answer)

link.fast.send({
  x: 100,
  y: 200,
})

link.reliable.send({
  type: 'chat',
  message: 'hello',
})

const ping = await link.ping()
```

---

## Positioning

**Not** another WebRTC wrapper.

**Not** another signaling framework.

TwinLink is:

> A focused 1-on-1 peer connection toolkit that makes direct browser-to-browser communication feel as simple as using a WebSocket.
