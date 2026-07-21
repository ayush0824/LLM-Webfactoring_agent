# Task 5: Build Pipeline Audit

The recruiting workflow remains unchanged. A separate PR workflow uses Node 22, activates the pnpm
version declared in `package.json`, installs with `--frozen-lockfile`, and runs type-check, lint, unit
tests, then build as fail-fast steps.

CI uses Turbo's `--affected` package set for type-checking, unit tests, and builds; this includes
changed packages and their dependents. Lint is incremental: Biome's CI-oriented `--changed` mode
checks every supported file changed from the PR base SHA, handles file selection through Git, and
succeeds when no supported files changed. `TURBO_SCM_BASE` and `TURBO_SCM_HEAD` use the PR SHAs,
while checkout fetches complete history so both comparisons are available.

Turbo's build outputs now match emitted artifacts: API `dist`, client `.output`, and generated proto
files. API compilation explicitly emits `dist` rather than suppressing a legitimate missing-output
warning. Tests no longer claim nonexistent coverage artifacts. Development remains persistent and
uncached; database generation, migration, and seed tasks are uncached because they are stateful.

The dependency-free pre-commit hook uses Biome's staged-file mode. `pnpm install` installs it through
the root `prepare` script, and `pnpm hooks:install` is an explicit recovery/setup command.
