# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## DriveValue (Flask app)

Mobile-first AI car price prediction app at `drivevalue/`.
- `drivevalue/app.py` — Flask backend with `/api/predict` endpoint and tuned depreciation model
- `drivevalue/templates/index.html` — single-page mobile UI (form, loader, result screens)
- `drivevalue/static/style.css` — dark theme + glassmorphism styling
- `drivevalue/static/script.js` — form handling, loading animation, result rendering

Run via the `DriveValue` workflow (`PORT=5000 python3 drivevalue/app.py`).
