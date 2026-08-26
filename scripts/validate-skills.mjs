import { readdir, readFile, stat } from "node:fs/promises";

import YAML from "yaml";

const expectedSkills = new Set(["progressbrief-memory", "progressbrief-report"]);

function parseSkillFrontmatter(contents, source) {
  const match = contents.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/u);
  if (match === null) {
    throw new Error(`${source}: SKILL.md must contain YAML frontmatter and a body.`);
  }

  const frontmatter = YAML.parse(match[1]);
  if (frontmatter === null || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new Error(`${source}: frontmatter must be a mapping.`);
  }

  const keys = Object.keys(frontmatter).sort();
  if (keys.join(",") !== "description,name") {
    throw new Error(`${source}: frontmatter may contain only name and description.`);
  }

  return { frontmatter, body: match[2] };
}

export async function validateSkills(skillsRoot) {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (
    directories.length !== expectedSkills.size ||
    directories.some((directory) => !expectedSkills.has(directory))
  ) {
    throw new Error(`skills/: expected exactly ${[...expectedSkills].sort().join(", ")}.`);
  }

  for (const directory of directories) {
    const skillUrl = new URL(`${directory}/`, skillsRoot);
    const contents = await readFile(new URL("SKILL.md", skillUrl), "utf8");
    const lineCount = contents.split("\n").length;
    const { frontmatter, body } = parseSkillFrontmatter(contents, directory);

    if (frontmatter.name !== directory) {
      throw new Error(`${directory}: frontmatter name must match the folder.`);
    }
    if (typeof frontmatter.description !== "string" || frontmatter.description.length < 40) {
      throw new Error(`${directory}: description must state the behavior and trigger context.`);
    }
    if (!/^[a-z0-9-]+$/u.test(frontmatter.name)) {
      throw new Error(`${directory}: name must use lowercase letters, digits, and hyphens.`);
    }
    if (lineCount > 500) {
      throw new Error(`${directory}: SKILL.md exceeds 500 lines.`);
    }
    if (/\bTODO\b|\[TODO/u.test(contents)) {
      throw new Error(`${directory}: generated TODO content remains.`);
    }
    if (!body.trimStart().startsWith("# ")) {
      throw new Error(`${directory}: body must begin with a title.`);
    }

    const agents = YAML.parse(await readFile(new URL("agents/openai.yaml", skillUrl), "utf8"));
    const interface_ = agents?.interface;
    if (interface_ === null || typeof interface_ !== "object") {
      throw new Error(`${directory}: agents/openai.yaml requires interface metadata.`);
    }
    if (
      typeof interface_.short_description !== "string" ||
      interface_.short_description.length < 25 ||
      interface_.short_description.length > 64
    ) {
      throw new Error(`${directory}: short_description must be 25–64 characters.`);
    }
    if (
      typeof interface_.default_prompt !== "string" ||
      !interface_.default_prompt.includes(`$${directory}`)
    ) {
      throw new Error(`${directory}: default_prompt must mention $${directory}.`);
    }

    const referenceInfo = await stat(new URL("references/product-boundary.md", skillUrl));
    if (!referenceInfo.isFile()) {
      throw new Error(`${directory}: product boundary reference is missing.`);
    }

    const skillEntries = await readdir(skillUrl);
    if (skillEntries.includes("README.md")) {
      throw new Error(`${directory}: skill directories must not contain README.md.`);
    }
  }
}

const skillsRoot = new URL("../skills/", import.meta.url);

try {
  await validateSkills(skillsRoot);
  process.stdout.write("Validated progressbrief-report and progressbrief-memory.\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
