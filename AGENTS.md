# AGENTS.md - fm

Guidelines for AI coding agents working in this repository.

## Project Overview

Email triage application built with **Bun** runtime (NOT Node.js).
TypeScript with strict mode. ESM modules.

---

## Quick Reference

| Task            | Command                           |
| --------------- | --------------------------------- |
| Install deps    | `bun install`                     |
| Run app         | `bun run src/index.ts`            |
| Run with HMR    | `bun --hot src/index.ts`          |
| Run tests       | `bun test`                        |
| Run single test | `bun test <path/to/file.test.ts>` |
| Type check      | `bunx tsc --noEmit`               |
| Lint & format   | `bunx biome check .`              |
| Auto-fix        | `bunx biome check --write .`      |

---

## Build / Lint / Test Commands

### Running the Application

```bash
# Standard run
bun run src/index.ts

# Development with hot reload
bun --hot src/index.ts
```

### Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/utils.test.ts

# Run tests matching pattern
bun test --grep "should handle"

# Watch mode
bun test --watch
```

### Type Checking

```bash
# Check types (no emit configured)
bunx tsc --noEmit
```

### Linting & Formatting (Biome)

```bash
# Check formatting, linting, and imports
bunx biome check .

# Auto-fix issues
bunx biome check --write .

# Format only
bunx biome format --write .

# Lint only
bunx biome lint .
```

---

## CRITICAL: Use Bun, NOT Node.js

This project uses Bun exclusively. **DO NOT** use Node.js, npm, yarn, pnpm, or vite.

| Instead of         | Use                          |
| ------------------ | ---------------------------- |
| `node file.ts`     | `bun file.ts`                |
| `npm install`      | `bun install`                |
| `npm run <script>` | `bun run <script>`           |
| `npx <pkg>`        | `bunx <pkg>`                 |
| `jest` / `vitest`  | `bun test`                   |
| `vite` / `webpack` | `bun build` or `Bun.serve()` |

### Bun-Native APIs (prefer these)

| Purpose          | Use                   | NOT                   |
| ---------------- | --------------------- | --------------------- |
| HTTP server      | `Bun.serve()`         | express, fastify      |
| SQLite           | `bun:sqlite`          | better-sqlite3        |
| Redis            | `Bun.redis`           | ioredis               |
| Postgres         | `Bun.sql`             | pg, postgres.js       |
| WebSocket        | built-in `WebSocket`  | ws                    |
| File I/O         | `Bun.file()`          | fs.readFile/writeFile |
| Shell commands   | `Bun.$\`cmd\``        | execa                 |
| Environment vars | Auto-loaded from .env | dotenv                |

---

## TypeScript Configuration

Strict mode is enabled. The following checks are enforced:

```json
{
  "strict": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true
}
```

### Type Safety Rules

- **NO** `as any` type casts
- **NO** `@ts-ignore` or `@ts-expect-error`
- **NO** empty catch blocks `catch(e) {}`
- Handle all indexed access as potentially undefined
- Use explicit `override` keyword when overriding methods

---

## Code Style Guidelines

### Imports

```typescript
// Use ESM imports (type: "module" in package.json)
import { something } from "./module.ts";

// Type-only imports use `type` keyword
import type { SomeType } from "./types.ts";

// Bun built-ins
import { Database } from "bun:sqlite";
import { test, expect } from "bun:test";
```

### File Organization

```
src/
  index.ts          # Entry point
  *.test.ts         # Tests co-located with source
```

### Naming Conventions

| Type                | Convention      | Example           |
| ------------------- | --------------- | ----------------- |
| Files               | kebab-case      | `email-parser.ts` |
| Variables/Functions | camelCase       | `parseEmail()`    |
| Classes             | PascalCase      | `EmailProcessor`  |
| Constants           | SCREAMING_SNAKE | `MAX_RETRIES`     |
| Types/Interfaces    | PascalCase      | `EmailMessage`    |

### Error Handling

```typescript
// Prefer explicit error handling
try {
  await riskyOperation();
} catch (error) {
  if (error instanceof SpecificError) {
    // Handle specific error
  }
  throw error; // Re-throw if not handled
}

// Never empty catch blocks
// BAD: catch(e) {}
```

### Testing Patterns

```typescript
import { test, expect, describe, beforeEach } from "bun:test";

describe("EmailParser", () => {
  beforeEach(() => {
    // Setup
  });

  test("should parse valid email", () => {
    const result = parseEmail("test@example.com");
    expect(result.valid).toBe(true);
  });
});
```

---

## Frontend Development (if applicable)

Use Bun's built-in HTML imports with `Bun.serve()`. **Do NOT use Vite**.

```typescript
import index from "./index.html";

Bun.serve({
  routes: {
    "/": index,
    "/api/endpoint": {
      GET: (req) => Response.json({ data: "value" }),
    },
  },
  development: { hmr: true, console: true },
});
```

---

## Environment Variables

Bun auto-loads `.env` files. No dotenv package needed.

```typescript
// Access directly
const apiKey = process.env.API_KEY;
// Or with Bun.env
const apiKey = Bun.env.API_KEY;
```

---

## Common Patterns

### HTTP Server

```typescript
Bun.serve({
  port: 3000,
  routes: {
    "/api/health": () => Response.json({ status: "ok" }),
  },
});
```

### File Operations

```typescript
// Read
const content = await Bun.file("path/to/file.txt").text();

// Write
await Bun.write("path/to/file.txt", "content");
```

### Shell Commands

```typescript
const result = await Bun.$`ls -la`.text();
```

---

## Checklist Before Committing

- [ ] `bunx tsc --noEmit` passes
- [ ] `bunx biome check .` passes
- [ ] `bun test` passes
- [ ] No `any` types or type suppressions added
- [ ] Error handling is explicit (no empty catches)
