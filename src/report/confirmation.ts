import type { ConfirmationPlan, ConfirmationQuestion } from "./types.js";

interface ConfirmationInput {
  generateNow?: boolean;
  modeNeedsConfirmation?: boolean;
  audienceNeedsConfirmation?: boolean;
  periodNeedsConfirmation?: boolean;
  structureNeedsConfirmation?: boolean;
  ambiguousEvidence?: string[];
}

function question(
  id: ConfirmationQuestion["id"],
  prompt: string,
  options: string[],
  recommendation: string,
): ConfirmationQuestion {
  return { id, prompt, options, recommendation };
}

export function createConfirmationPlan(input: ConfirmationInput): ConfirmationPlan {
  if (input.generateNow === true) {
    return {
      questions: [],
      nextQuestion: undefined,
      stoppedByGenerateNow: true,
      unresolvedEvidenceDisposition: "omit",
    };
  }

  const questions: ConfirmationQuestion[] = [];
  if (input.modeNeedsConfirmation === true) {
    questions.push(
      question(
        "mode",
        "Should this be a time-bounded Snapshot or a purpose-bounded Deep Dive?",
        ["Snapshot", "Deep Dive"],
        "Snapshot",
      ),
    );
  }
  if (input.audienceNeedsConfirmation === true) {
    questions.push(
      question(
        "audience",
        "Who needs to understand or act on this report?",
        ["Manager and collaborators", "Leadership", "Mentor"],
        "Manager and collaborators",
      ),
    );
  }
  if (input.periodNeedsConfirmation === true) {
    questions.push(
      question(
        "period",
        "Which reporting period should the Snapshot cover?",
        ["This week", "Previous week", "Custom range"],
        "This week",
      ),
    );
  }
  if (input.structureNeedsConfirmation === true) {
    questions.push(
      question(
        "structure",
        "Use the proposed orientation, movement, attention, and forward-view structure?",
        ["Use it", "Adjust it"],
        "Use it",
      ),
    );
  }
  if ((input.ambiguousEvidence?.length ?? 0) > 0) {
    questions.push(
      question(
        "ambiguous-evidence",
        `Confirm or omit ${String(input.ambiguousEvidence?.length ?? 0)} unresolved evidence item(s)?`,
        ["Omit unresolved items", "Confirm details"],
        "Omit unresolved items",
      ),
    );
  }

  const bounded = questions.slice(0, 5);
  return {
    questions: bounded,
    nextQuestion: bounded[0],
    stoppedByGenerateNow: false,
    unresolvedEvidenceDisposition: "pending",
  };
}
