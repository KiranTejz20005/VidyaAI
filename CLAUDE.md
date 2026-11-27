# Contributor conventions

## Git
- Use Conventional Commits (`feat`, `fix`, `docs`, `chore`, ...) with a scope, e.g. `feat(grading): ...`.
- Do not add `Co-Authored-By` lines or any AI attribution to commit messages or PR descriptions.
- Land work through a pull request to `main`; merge only when CI is green. Fix failing checks instead of bypassing them.
- Before pushing, run the same steps as `.github/workflows/ci.yml`: `npm run lint`, `cd apps/backend && npx prisma validate && npx prisma generate`, `npm run build`, `npm run test`.

## Deploy
- Frontend deploys to Vercel (`apps/frontend`); backend to Render (`render.yaml`). A passing `npm run build` is the gate for both.
- Backend migrations run through `npm run migrate:deploy --workspace=apps/backend` (clears failed-migration state, prefers `DIRECT_URL`). Keep migration SQL idempotent.

## Frontend
- Typeface is Geist (Sans and Mono via `next/font`); use `var(--font-sans)` / `var(--font-mono)`, never hardcode font stacks.
- Reuse `src/design-system` primitives and the tokens in `globals.css`. Animate only `transform` and `opacity`, honor `prefers-reduced-motion`, and never use `transition: all`.
