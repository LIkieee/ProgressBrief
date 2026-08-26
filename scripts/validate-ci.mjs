import { access, readdir, readFile } from "node:fs/promises";

import YAML from "yaml";

const root = new URL("../", import.meta.url);
const workflowRoot = new URL("../.github/workflows/", import.meta.url);
const allowedActions = new Set(["actions/checkout@v4", "actions/setup-node@v4"]);
const forbiddenRunPattern = /(?:\bnpm\s+publish\b|\bgit\s+push\b|\bgh\s+|\bsudo\s+|\bchmod\s+777\b|\$\{\{\s*secrets\.)/u;

function asMapping(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a mapping.`);
  }
  return value;
}

function referencedScripts(run) {
  return [...run.matchAll(/\bnpm\s+run\s+([a-zA-Z0-9:_-]+)/gu)].map(
    (match) => match[1],
  );
}

async function validateLocalPath(relativePath, label) {
  if (relativePath.includes("..")) {
    throw new Error(`${label}: local paths may not traverse outside the repository.`);
  }
  await access(new URL(relativePath.replace(/^\.\//u, ""), root));
}

export async function validateWorkflows() {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const files = (await readdir(workflowRoot))
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort();

  if (files.length === 0) {
    throw new Error("No GitHub Actions workflow files were found.");
  }

  const operatingSystems = new Set();
  let gateZeroInvocationFound = false;

  for (const file of files) {
    const workflow = asMapping(
      YAML.parse(await readFile(new URL(file, workflowRoot), "utf8")),
      file,
    );
    const events = workflow.on;
    if (events !== null && typeof events === "object" && "pull_request_target" in events) {
      throw new Error(`${file}: pull_request_target is not permitted.`);
    }

    const permissions = asMapping(workflow.permissions, `${file}: permissions`);
    if (permissions.contents !== "read" || Object.keys(permissions).length !== 1) {
      throw new Error(`${file}: workflow permissions must be contents: read only.`);
    }

    const jobs = asMapping(workflow.jobs, `${file}: jobs`);
    for (const [jobName, rawJob] of Object.entries(jobs)) {
      const job = asMapping(rawJob, `${file}: job ${jobName}`);
      if (job["continue-on-error"] === true) {
        throw new Error(`${file}: job ${jobName} may not ignore failures.`);
      }

      const matrix = job.strategy?.matrix;
      if (Array.isArray(matrix?.os)) {
        for (const operatingSystem of matrix.os) {
          operatingSystems.add(operatingSystem);
        }
      } else if (typeof job["runs-on"] === "string" && !job["runs-on"].includes("${{")) {
        operatingSystems.add(job["runs-on"]);
      }

      if (typeof job["working-directory"] === "string") {
        await validateLocalPath(job["working-directory"], `${file}: job ${jobName}`);
      }

      if (!Array.isArray(job.steps) || job.steps.length === 0) {
        throw new Error(`${file}: job ${jobName} must have steps.`);
      }

      for (const [index, rawStep] of job.steps.entries()) {
        const step = asMapping(rawStep, `${file}: ${jobName} step ${index + 1}`);
        if (step["continue-on-error"] === true) {
          throw new Error(`${file}: step ${index + 1} may not ignore failures.`);
        }
        if (typeof step.uses === "string") {
          if (step.uses.startsWith("./")) {
            await validateLocalPath(step.uses, `${file}: step ${index + 1}`);
          } else if (!allowedActions.has(step.uses)) {
            throw new Error(`${file}: action ${step.uses} is not allowlisted.`);
          }
        }
        if (typeof step["working-directory"] === "string") {
          await validateLocalPath(step["working-directory"], `${file}: step ${index + 1}`);
        }
        if (typeof step.run === "string") {
          if (forbiddenRunPattern.test(step.run)) {
            throw new Error(`${file}: step ${index + 1} contains an unsafe command.`);
          }
          for (const script of referencedScripts(step.run)) {
            if (typeof packageJson.scripts?.[script] !== "string") {
              throw new Error(`${file}: npm script ${script} does not exist.`);
            }
          }
          if (/\bnpm\s+run\s+verify:gate\s+--\s+0\b/u.test(step.run)) {
            gateZeroInvocationFound = true;
          }
        }
      }
    }
  }

  for (const required of ["ubuntu-latest", "macos-latest"]) {
    if (!operatingSystems.has(required)) {
      throw new Error(`CI matrix must include ${required}.`);
    }
  }
  if (!gateZeroInvocationFound) {
    throw new Error("CI must invoke npm run verify:gate -- 0.");
  }
}

try {
  await validateWorkflows();
  process.stdout.write("Validated GitHub Actions workflows for macOS and Linux.\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
