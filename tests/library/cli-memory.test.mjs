import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { readKnowledgeNotes } from "../../dist/index.js";

const execFileAsync = promisify(execFile);
const cli = new URL("../../dist/cli/main.js", import.meta.url);

test("the companion CLI initializes, dispatches Remember, and undoes through explicit Workspace scope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "progressbrief-cli-memory-"));
  const library = join(directory, "Visible Library");
  const initialized = await execFileAsync(process.execPath, [
    cli.pathname,
    "library",
    "init",
    "--directory",
    library,
    "--workspace",
    "Northstar Systems",
    "--kind",
    "employer",
    "--project",
    "Migration",
  ]);
  assert.match(initialized.stdout, /Work Library ready at .*Visible Library; Workspace Northstar Systems \(wsp_/u);

  const captured = await execFileAsync(process.execPath, [
    cli.pathname,
    "memory",
    "capture",
    "--library",
    library,
    "--workspace",
    "northstar-systems",
    "--text",
    "Remember: staging migrations require VPN access.",
  ]);
  assert.equal(captured.stdout, "Saved to Northstar Systems: Knowledge.\n");
  assert.equal((await readKnowledgeNotes(library, "northstar-systems")).length, 1);

  const undone = await execFileAsync(process.execPath, [
    cli.pathname,
    "memory",
    "undo",
    "--library",
    library,
    "--workspace",
    "northstar-systems",
  ]);
  assert.equal(undone.stdout, "Undid the last ProgressBrief mutation in Northstar Systems.\n");
  assert.equal((await readKnowledgeNotes(library, "northstar-systems")).length, 0);
});
