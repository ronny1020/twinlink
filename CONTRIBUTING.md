# Contributing to TwinLink

First off, thanks for taking the time to contribute! Contributions are what make the open-source community such an amazing place to learn, inspire, and create.

## Code of Conduct

Please be respectful and professional in your interactions.

## How Can I Contribute?

### Reporting Bugs

- Use the GitHub Issue Tracker.
- Describe the bug and provide steps to reproduce.

### Suggesting Enhancements

- Use the GitHub Issue Tracker.
- Describe the enhancement and why it would be useful.

### Pull Requests

1. Fork the repository.
2. Create a branch using the repository convention (for example, `feat/amazing-feature`).
3. Commit using a scoped Conventional Commit (for example, `feat(api): add amazing feature`).
4. Push the branch (`git push origin feat/amazing-feature`).
5. Open a Pull Request.

## Development Setup

This project uses [Bun](https://bun.sh/).

### Installation

```bash
bun install
```

### Running the Demo

The demo is a separate workspace that showcases a 1-on-1 chat.

```bash
# Run from root
bun run demo

# Or from the demo folder
cd demo && bun run start
```

### Development Watch Mode

```bash
bun run dev
```

### Testing

TwinLink uses `bun test` for unit tests and Bun's experimental `WebView` for E2E tests.

```bash
bun test
```

### Linting & Formatting

```bash
# Lint
bun run lint

# Format
bun run format

# Type-check
bun run typecheck
```

### Build

To compile the library for distribution (ESM, CJS, and `.d.ts`):

```bash
bun run build
```

### Publishing (Maintainers)

Package publication is manual; CI only deploys the demo. Before publishing, use a `release/<version>` branch, choose a new version that has not already been published, and run:

```bash
bun run release:check
bun pm pack --dry-run --ignore-scripts
```

When both checks pass, publish with your npm credentials:

```bash
npm publish
```

### Deployment

The demo is automatically deployed to GitHub Pages via CI/CD on every push to `master`.

---

## License

By contributing, you agree that your contributions will be licensed under its Apache 2.0 License.
