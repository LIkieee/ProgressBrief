import type {
  ReportMode,
  StructureResolution,
  StructureSection,
} from "./types.js";

export const DEFAULT_SNAPSHOT_STRUCTURE = [
  { key: "orientation", role: "orientation", title: "Orientation" },
  { key: "movement", role: "movement", title: "Movement" },
  { key: "attention", role: "attention", title: "Attention" },
  { key: "forward-view", role: "forward-view", title: "Forward view" },
] as const satisfies readonly StructureSection[];

interface StructureInput {
  mode: ReportMode;
  explicit?: readonly StructureSection[];
  remembered?: readonly StructureSection[];
  proposed?: readonly StructureSection[];
}

function assertStructure(sections: readonly StructureSection[]): void {
  if (sections.length === 0) throw new Error("A report structure requires at least one section.");
  if (new Set(sections.map(({ key }) => key)).size !== sections.length) {
    throw new Error("Report structure keys must be unique.");
  }
  if (sections.some(({ key, title }) => key.trim().length === 0 || title.trim().length === 0)) {
    throw new Error("Report structure keys and titles must be non-empty.");
  }
}

export function resolveStructure(input: StructureInput): StructureResolution {
  const selected = input.explicit ?? input.remembered ?? input.proposed;
  if (selected !== undefined) assertStructure(selected);

  if (input.explicit !== undefined) {
    return { sections: input.explicit, source: "user", needsConfirmation: false };
  }
  if (input.remembered !== undefined) {
    return { sections: input.remembered, source: "remembered", needsConfirmation: false };
  }
  if (input.proposed !== undefined) {
    return { sections: input.proposed, source: "agent-proposal", needsConfirmation: true };
  }

  if (input.mode === "deep-dive") {
    throw new Error("A Deep Dive requires an evidence-led structure proposal.");
  }
  return {
    sections: DEFAULT_SNAPSHOT_STRUCTURE,
    source: "default-proposal",
    needsConfirmation: true,
  };
}
