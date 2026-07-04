# TwinLink - Gemini CLI Instructions

Foundational mandates for Gemini CLI in the TwinLink repository.

## Architecture & Principles

- **Browser-only**: Library depends on `RTCPeerConnection`.
- **No signaling server**: Base64 tokens are used for signaling.
- **1-on-1 only**: Focus on host-joiner relationship.
- **No runtime dependencies**: Keep `dependencies` empty in `package.json`.

## Agent Skills

This repository includes specialized skills for Gemini CLI:

- `bun-webview`: For managing E2E tests and native browser windows.
- `bun-fe-toolchain`: For bundling and serving the demo application.
  Run `/skills list` to verify they are installed.

## Development Workflow

- **Bun**: Use Bun for all tasks (install, test, build).
- **Testing**:
  - Unit tests: `src/index.test.ts` (mocked WebRTC).
  - E2E tests: `tests/chat.test.ts` (uses `Bun.WebView` and requires `data-testid` in `demo/`).
- **Build**: Always run `bun run build` after changes to `src/index.ts` if they need to be reflected in the demo (though the demo now imports from `src/` directly in dev).
- **Verification**: Always run `bun test` and `bun run typecheck` before finishing a task.

## Key Files

- `src/index.ts`: Main library logic.
- `demo/src/index.tsx`: Demo React application.
- `tests/chat.test.ts`: E2E integration test.

## Common Commands

- `bun test`: Run all tests.
- `bun run build`: Build the library.
- `bun run demo`: Run the demo application.
- `bun run typecheck`: Run TypeScript type checking.
- `bun run lint`: Run ESLint.
- `bun run format`: Run Prettier.
