import { chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const gitCheck = spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
if (gitCheck.status !== 0) process.exit(0);

await chmod(new URL("../.githooks/pre-commit", import.meta.url), 0o755);
const configured = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
	stdio: "inherit",
});
if (configured.status !== 0) process.exit(configured.status ?? 1);
