# Agent preferences

- Do not add Playwright tests, Playwright config, or any browser e2e suite. This project does not use Playwright.
- Do not reintroduce `test:e2e`, `@playwright/test`, or an `e2e/` directory.
- Prefer Vitest unit tests (`pnpm test:unit`) for collector, UniFi adapters, filters, and other logic. Use `pnpm check` for types.
- Automatically expand the README and add docs for relevant functionality to end users.
- After each validated unit of work, commit and push to the current branch. Do not wait to be asked. Leave unrelated untracked files (such as local notes) out of the commit.
