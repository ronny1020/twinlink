---
name: bun-webview
description: Guidance for using Bun's experimental WebView for cross-platform desktop apps and E2E testing. Use when Gemini CLI needs to create interactive browser windows or run integration tests that require a real browser environment.
---

# Bun WebView

Bun provides a built-in `WebView` class (experimental) that allows opening native browser windows directly from the Bun runtime.

## Basic Usage

```typescript
import { WebView } from 'bun'

const view = new WebView()
await view.navigate('https://example.com')
// or navigate to a local file/string
// await view.navigate('file:///path/to/index.html')
```

## Testing Workflow (E2E)

In this project, `WebView` is primarily used for testing WebRTC connections between peers.

1.  **Serve Content**: Start a local server (e.g., using `Bun.serve`) to provide the HTML/JS.
2.  **Initialize WebView**: Create instances for each peer (Host and Joiner).
3.  **Evaluate JS**: Use `view.evaluate(script)` to interact with the page or extract state.
4.  **Wait for State**: Implement a `waitFor` helper since evaluation is asynchronous and state may change over time.
5.  **Cleanup**: Always call `view.close()` in a `finally` block to avoid dangling processes.

### Example waitFor Helper

```typescript
async function waitFor(view: WebView, predicate: string, timeout = 10000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const result = await view.evaluate(predicate)
      if (result) return result
    } catch {
      /* ignore eval errors */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timeout waiting for: ${predicate}`)
}
```

## Debugging Tips

- **Log Capture**: Since native DevTools are not easily accessible, inject a log capture script into the page that pushes logs to a global array (e.g., `window.logs`). Evaluate this array periodically from the test.
- **Headless Mode**: `Bun.WebView` requires an active display (X11/Wayland). Use `xvfb-run` in headless environments like CI.
- **Evaluation Context**: `evaluate` returns values that are JSON-serializable. Complex objects or DOM elements cannot be returned directly.

## Constraints

- Experimental: API might change in future Bun versions.
- Single Threaded: UI interactions often need to happen on the main thread depending on the OS.
