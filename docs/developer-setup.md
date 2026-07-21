# Developer setup

1. Install Node.js 22 and enable Corepack: `corepack enable`.
2. Install the repository's declared pnpm version: `corepack prepare pnpm@9.15.0 --activate`.
3. Install dependencies: `pnpm install --frozen-lockfile`.
4. Install the pre-commit hook if installation scripts were disabled: `pnpm hooks:install`.
5. Seed local data when needed: `pnpm db:seed`.
6. Start the workspace: `pnpm dev`, or use `pnpm dev:user`, `pnpm dev:admin`, or `pnpm dev:api`.

Before opening a PR, run:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The pre-commit hook runs Biome only against staged supported files. It does not run E2E tests or
validate the entire repository. PR CI uses full Git history and Turbo's affected-package selection,
including dependents.
