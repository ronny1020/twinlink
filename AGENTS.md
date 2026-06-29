---
name: twinlink-agents
description: Rules and orientation for AI agents working on the TwinLink repository. Read this before making any changes to the codebase, documentation, or configuration.
---

# TwinLink — Agent Guide

> Read this entire file before making any changes.

---

## What TwinLink Is

TwinLink is a **browser-only TypeScript library** that wraps WebRTC Data Channels into a minimal 1-on-1 peer connection API. It is published as an npm package.

Four rules that never bend:

1. **1-on-1 only.** No rooms, no mesh, no broadcasting.
2. **No signaling server.** TwinLink produces and consumes base64 session tokens. How those tokens travel is the caller's problem.
3. **Browser-only.** The library depends on `RTCPeerConnection` and friends — it does not run in Node.js or Bun natively.
4. **No runtime dependencies.** `dependencies` in `package.json` stays empty.

---

## Repository Layout

```text
twinlink/
├── src/
│   ├── index.ts          # Entire library — single public module
│   └── index.test.ts     # Unit tests (bun test, mocked WebRTC globals)
├── tests/
│   └── chat.test.ts      # E2E tests using Bun WebView (real browser)
├── demo/
│   ├── index.html        # Entry point for Bun's HTML bundler
│   ├── index.ts          # Dev server (bun --hot index.ts)
│   └── src/
│       └── index.tsx     # React demo app
├── dist/                 # Build output — never edit directly
├── CLAUDE.md             # pointer to @AGENTS.md
├── AGENTS.md             # This file
├── CONTRIBUTING.md       # Dev setup, testing, build instructions
└── README.md             # User-facing docs only
```

---

## Public API

All exports live in `src/index.ts`.

```typescript
export interface TwinLinkOptions {
  rtc?: RTCConfiguration
  iceGatheringTimeoutMs?: number // default: 5 000 ms
  pingTimeoutMs?: number // default:  5 000 ms
}

export function createTwinLink<Fast = unknown, Reliable = unknown>(
  options?: TwinLinkOptions,
): TwinLink<Fast, Reliable>
```

```typescript
interface TwinLink<Fast, Reliable> {
  host(): Promise<string>
  join(offer: string): Promise<string>
  connect(answer: string): Promise<void>
  ping(): Promise<number>
  close(): void
  latency: number // last RTT in ms; resets to 0 on close()
  jitter: number // variation between last two RTTs; resets to 0 on close()
  connectionState: RTCPeerConnectionState
  fast: {
    send(data: Fast): void // silent drop when channel not open
    onMessage(handler: (data: Fast) => void): () => void // returns unsubscribe fn
  }
  reliable: {
    send(data: Reliable): boolean // false when channel not open
    onMessage(handler: (data: Reliable) => void): () => void // returns unsubscribe fn
  }
  onConnectionStateChange(
    handler: (state: RTCPeerConnectionState) => void,
  ): () => void // returns unsubscribe fn
}
```

### Behavioural contracts

| Member                                  | Contract                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `fast.send`                             | Drops silently when channel is not open — intentional UDP-like semantics.                                          |
| `reliable.send`                         | Returns `false` when channel is not open so callers can detect the drop.                                           |
| `onMessage` / `onConnectionStateChange` | Support multiple listeners. Each call registers one handler and returns a function that removes only that handler. |
| `close()`                               | Rejects all pending pings, resets `latency` and `jitter` to `0`, closes both channels, closes the peer connection. |

### Channel semantics

| Channel    | Ordered | Retransmits | Typical use               |
| ---------- | ------- | ----------- | ------------------------- |
| `fast`     | No      | 0           | Positions, input, physics |
| `reliable` | Yes     | unlimited   | Chat, state, events       |

### Signaling flow

```
Host                  Joiner
────                  ──────
host()  ──offer──▶   join(offer)
        ◀─answer──
connect(answer)
```

---

## Tooling

This project uses **Bun** exclusively. See `CLAUDE.md` for Bun-specific rules.

| Task         | Command             |
| ------------ | ------------------- |
| Install deps | `bun install`       |
| Run tests    | `bun test`          |
| Typecheck    | `bun run typecheck` |
| Lint         | `bun run lint`      |
| Format       | `bun run format`    |
| Build        | `bun run build`     |
| Run demo     | `bun run demo`      |

After every change, run `bun run typecheck`, `bun run lint`, and `bun test`. Fix all errors before finishing.

---

## Testing Strategy

### Unit tests — `src/index.test.ts`

- Run in Bun's JS runtime without a real browser.
- WebRTC globals are **mocked** in `beforeAll`.
- Type mock channels as `Partial<RTCDataChannel>`.
- Never use `as unknown as` double casts. Use `@ts-expect-error` with a comment only when `Partial<T>` is not enough.

### E2E tests — `tests/chat.test.ts`

- Opens real browser windows via `Bun.WebView`.
- Spins up a local `Bun.serve()` pointing at `demo/index.html`.
- Covers the full host → join → connect → message flow over a live WebRTC session.
- **Important**: The demo UI MUST use `data-testid` attributes for all interactive elements to ensure reliable selection in these tests.
- Slow (~4–8 s) and requires a display. They run in CI via the standard `bun test` command.

---

## Code Style

- **Strict TypeScript** — `noUncheckedIndexedAccess`, `noImplicitOverride`, `strict: true`.
- **No `as unknown as`** — use `Partial<T>` or a commented `@ts-expect-error`.
- **No `any`** — use precise union types or `unknown` with narrowing.
- **Error wrapping** — always pass `{ cause: e }` when re-throwing.
- **Fail silently toward callers** — invalid ICE candidates are `console.warn`'d, not thrown.
- Prettier and ESLint run via `lint-staged` on commit. Run `bun run format` before committing.

---

## Git Workflow

### Branch naming

Never commit directly to `main`. Every change lives on a dedicated branch.

| Type     | Pattern                 | When to use                               |
| -------- | ----------------------- | ----------------------------------------- |
| Feature  | `feat/<short-name>`     | New behaviour or API surface              |
| Bug fix  | `fix/<short-name>`      | Corrects incorrect behaviour              |
| Docs     | `docs/<short-name>`     | README, AGENTS.md, CONTRIBUTING.md only   |
| Refactor | `refactor/<short-name>` | Internal restructure, no behaviour change |
| Test     | `test/<short-name>`     | Adding or updating tests only             |
| Chore    | `chore/<short-name>`    | Tooling, deps, CI, build config           |
| Release  | `release/<version>`     | Version bumps and changelog               |

**Examples:**

```
feat/dual-generics
fix/reliable-silent-drop
docs/agent-pr-workflow
refactor/encode-decode-pure
test/multi-listener-unit
chore/update-bun
release/1.2.0
```

### Commit messages

Follow Conventional Commits. **Scope is required** — a commit without a scope is invalid.

```text
<type>(<scope>): <short description>
```

**Types:**

| Type       | Use for                          |
| ---------- | -------------------------------- |
| `feat`     | New feature or API addition      |
| `fix`      | Bug fix                          |
| `docs`     | Documentation only               |
| `refactor` | Restructure, no behaviour change |
| `test`     | Test additions or changes        |
| `chore`    | Tooling, deps, CI, config        |
| `perf`     | Performance improvement          |
| `revert`   | Reverts a previous commit        |

**Scopes:**

| Scope       | Covers                                                             |
| ----------- | ------------------------------------------------------------------ |
| `api`       | Public interface (`TwinLink`, `createTwinLink`, `TwinLinkOptions`) |
| `signaling` | `host()`, `join()`, `connect()`, ICE handling                      |
| `channels`  | `fast` / `reliable` channel logic                                  |
| `ping`      | Ping, latency, jitter                                              |
| `types`     | TypeScript types and generics only                                 |
| `tests`     | Unit or E2E test files                                             |
| `docs`      | README, AGENTS.md, CONTRIBUTING.md                                 |
| `build`     | Build config, `package.json`, `tsconfig`                           |
| `ci`        | GitHub Actions workflows                                           |
| `demo`      | Files under `demo/`                                                |

**Examples:**

```
feat(api): split generic into Fast and Reliable type params
fix(channels): reliable.send now returns false when channel is closed
fix(ping): use sendReliable helper consistently
refactor(signaling): move encode/decode outside factory function
docs(docs): add AI agent hosting section to README
test(tests): add multi-listener unit tests
chore(build): upgrade Bun to 1.2.0
```

**Breaking changes** — add a footer:

```bash
feat(api): split generic into Fast and Reliable type params

BREAKING CHANGE: createTwinLink now takes <Fast, Reliable> instead of <T>.
Update all call sites accordingly.
```

---

## Pull Requests

### Before opening a PR

Read the repository PR template first — always:

```bash
cat .github/pull_request_template.md
```

Fill in every section. Do not delete sections that don't apply — mark them `N/A`.

### Opening the PR

Write the body to a temp file, then pass it to `gh`:

```bash
gh pr create \
  --title "<type>(<scope>): <short description>" \
  --body-file /tmp/pr-body.md \
  --base master \
  --head <your-branch>
```

The PR title must follow the same `<type>(<scope>): <description>` format as commit messages.

### Pre-submit checklist

- [ ] Branch name matches its type pattern.
- [ ] Every commit follows `<type>(<scope>): <description>` with a scope.
- [ ] `bun run typecheck` — zero errors.
- [ ] `bun run lint` — zero errors.
- [ ] `bun test` — all pass.
- [ ] PR template filled in (no deleted sections).
- [ ] `dist/` not modified directly.
- [ ] No new runtime dependencies added.

---

## Hard Limits

- ❌ No signaling server or server-side code.
- ❌ No support for more than 2 peers.
- ❌ No runtime npm dependencies.
- ❌ No direct edits to `dist/` — it is generated by `bun run build`.
- ❌ No `express`, `ws`, `jest`, `vitest`, `webpack`, or `vite`.
- ❌ No trickle ICE — gather fully before encoding.
- ❌ No commits directly to `main`.
- ❌ No PR opened without first reading `.github/pull_request_template.md`.
- ❌ No commit or PR title without a scope.
