import { writeFile, truncate } from "node:fs/promises";

import { captureMemory } from "../../../dist/index.js";
import {
  runLibraryMutation,
  withLibraryLock,
} from "../../../dist/library/persistence.js";

const [command, libraryRoot, ...arguments_] = process.argv.slice(2);

if (command === "hold-lock") {
  const [signal, duration] = arguments_;
  await withLibraryLock(libraryRoot, async () => {
    await writeFile(signal, "acquired", "utf8");
    await new Promise((resolve) => setTimeout(resolve, Number(duration)));
  });
} else if (command === "try-lock") {
  const [timeout] = arguments_;
  try {
    await withLibraryLock(libraryRoot, async () => undefined, { timeoutMs: Number(timeout) });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
} else if (command === "capture") {
  const [workspace, summary] = arguments_;
  await captureMemory({
    libraryDirectory: libraryRoot,
    workspace,
    text: `Capture: ${summary}.`,
    occurredOn: "2026-08-26",
    now: "2026-08-26T16:10:00Z",
  });
} else if (command === "interrupt") {
  const [workspace, target] = arguments_;
  const before = await (await import("node:fs/promises")).readFile(target, "utf8");
  await runLibraryMutation(
    libraryRoot,
    workspace,
    "interrupted mutation fixture",
    [{ path: target, before, after: `${before}\ninterrupted` }],
    {
      afterApply: async () => {
        await truncate(target, 7);
        process.exit(86);
      },
    },
  );
} else {
  throw new Error(`Unknown worker command: ${command}`);
}
