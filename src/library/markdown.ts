import { parse, stringify } from "yaml";

import { assertValidDocument } from "../contracts/schema-validator.js";
import type { KnowledgeNote, WorklogEntry, WorkspaceDocument } from "./types.js";

const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/u;
const WORKLOG_RECORD = /<!-- progressbrief-entry:start -->\n```yaml\n([^\n]+)\n```\n[\s\S]*?<!-- progressbrief-entry:end -->/gu;

function yamlFrontmatter(document: object): string {
  return `---\n${stringify(document).trimEnd()}\n---`;
}

function parseFrontmatter(markdown: string): unknown {
  const match = FRONTMATTER.exec(markdown);
  if (match?.[1] === undefined) throw new Error("ProgressBrief Markdown is missing YAML frontmatter.");
  return parse(match[1]);
}

function displayLine(value: string): string {
  return value.replace(/[\r\n]+/gu, " ").trim();
}

export function serializeWorkspace(workspace: WorkspaceDocument): string {
  assertValidDocument("workspace", workspace);
  const projects = workspace.projects
    .map((project) => `- **${displayLine(project.name)}** (${project.slug})`)
    .join("\n");
  return `${yamlFrontmatter(workspace)}\n\n# ${displayLine(workspace.name)}\n\n${workspace.archived ? "Archived Workspace." : "Active Workspace."}\n\n## Projects\n\n${projects}\n`;
}

export function parseWorkspace(markdown: string): WorkspaceDocument {
  const workspace = parseFrontmatter(markdown) as WorkspaceDocument;
  assertValidDocument("workspace", workspace);
  return workspace;
}

export function serializeKnowledgeNote(note: KnowledgeNote): string {
  assertValidDocument("knowledge-note", note);
  const examples = note.examples.length > 0
    ? note.examples.map((value) => `- ${displayLine(value)}`).join("\n")
    : "_None recorded._";
  const caveats = note.caveats.length > 0
    ? note.caveats.map((value) => `- ${displayLine(value)}`).join("\n")
    : "_None recorded._";
  return `${yamlFrontmatter(note)}\n\n# ${displayLine(note.title)}\n\n${note.body.trim()}\n\n## Examples\n\n${examples}\n\n## Caveats\n\n${caveats}\n`;
}

export function parseKnowledgeNote(markdown: string): KnowledgeNote {
  const note = parseFrontmatter(markdown) as KnowledgeNote;
  assertValidDocument("knowledge-note", note);
  return note;
}

export function serializeWorklogMonth(yearMonth: string, entries: readonly WorklogEntry[]): string {
  const ordered = [...entries].sort((left, right) => {
    const byDate = left.occurredOn.localeCompare(right.occurredOn);
    return byDate === 0 ? left.createdAt.localeCompare(right.createdAt) : byDate;
  });
  const records = ordered.map((entry) => {
    assertValidDocument("worklog-entry", entry);
    const metadata = JSON.stringify(entry);
    return [
      "<!-- progressbrief-entry:start -->",
      "```yaml",
      metadata,
      "```",
      `## ${entry.occurredOn} — ${displayLine(entry.summary)}`,
      "",
      entry.details.trim(),
      "<!-- progressbrief-entry:end -->",
    ].join("\n");
  });
  return `# Worklog — ${yearMonth}\n\n${records.join("\n\n")}\n`;
}

export function parseWorklogMonth(markdown: string): WorklogEntry[] {
  const entries: WorklogEntry[] = [];
  for (const match of markdown.matchAll(WORKLOG_RECORD)) {
    if (match[1] === undefined) continue;
    const entry = parse(match[1]) as WorklogEntry;
    assertValidDocument("worklog-entry", entry);
    entries.push(entry);
  }
  return entries;
}
