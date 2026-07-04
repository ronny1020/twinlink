---
name: bun-fe-toolchain
description: Efficiently use Bun's built-in frontend toolchain for bundling, serving, and hot-reloading web applications. Use when Gemini CLI needs to build React, Vue, or Vanilla JS/TS apps, manage HTML entry points, or configure CSS plugins like Tailwind.
---

# Bun Frontend Toolchain

Bun is an all-in-one JavaScript runtime that replaces Babel, Webpack, Rollup, and Vite with significantly faster built-in alternatives.

## Bundling with `Bun.build`

Use `Bun.build` for programmatic bundling. It supports TypeScript, JSX, and CSS out of the box.

```typescript
await Bun.build({
  entrypoints: ['index.html'], // HTML entrypoints automatically handle scripts/styles
  outdir: './dist',
  minify: true,
  target: 'browser',
  plugins: [], // e.g., tailwind plugins
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
```

## Hot Reloading (`bun --hot`)

For development, use `bun --hot` to enable Hot Module Replacement (HMR).

```bash
bun --hot index.ts
```

## Serving Content

Use `Bun.serve` for a fast web server. It can serve static files and handle custom routes.

```typescript
import index from './index.html'

Bun.serve({
  routes: {
    '/': index, // Serves the bundled HTML
  },
  development: true, // Enables HMR support on the server
})
```

## CSS and Tailwind

Bun supports CSS imports directly. For Tailwind CSS v4+, use a plugin or the built-in support if available in newer versions.

```typescript
import tailwind from 'bun-plugin-tailwind'
// Add to Bun.build plugins
```

## Workspaces

In monorepos, use `bun --filter <workspace-name> <command>` to run commands in specific packages.

```bash
bun --filter demo start
```

## Performance Benefits

- **Speed**: Bundling is often 10-100x faster than Webpack or Vite.
- **Zero Config**: TypeScript and JSX work without any external configuration files (tsconfig.json is still recommended for editor support).
- **Single Binary**: No need for `node_modules` to run the bundler if using the standalone Bun binary.
