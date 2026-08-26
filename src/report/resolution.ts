import type {
  ExplicitReportingPeriod,
  ModeResolution,
  ReportMode,
  ResolvedReportingPeriod,
  ResolvedReportRequest,
  ReportingCadence,
} from "./types.js";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

interface ModeResolutionInput {
  prompt: string;
  explicitMode?: ReportMode;
  generateNow?: boolean;
}

interface PeriodResolutionInput {
  prompt: string;
  currentDate: string;
  explicitPeriod?: ExplicitReportingPeriod;
}

interface ReportRequestInput extends ModeResolutionInput, PeriodResolutionInput {
  audience?: string;
  purpose?: string;
}

function dateFromIso(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new Error(`${value} is not a valid calendar date.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${value} is not a valid calendar date.`);
  }
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function startOfWeek(date: Date): Date {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

function longDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function monthYear(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function inferredCadence(prompt: string): ReportingCadence {
  if (/\b(?:biweekly|bi-weekly|two[- ]week)\b/iu.test(prompt)) return "biweekly";
  if (/\bquarter(?:ly)?\b|\bq[1-4]\b/iu.test(prompt)) return "quarterly";
  if (/\bmonth(?:ly)?\b/iu.test(prompt)) return "monthly";
  return "weekly";
}

export function resolveReportMode(input: ModeResolutionInput): ModeResolution {
  if (input.explicitMode !== undefined) {
    return { mode: input.explicitMode, source: "explicit", needsConfirmation: false };
  }

  const deepDive = /\bdeep[ -]?dive\b|\b(?:design|architecture|milestone) review\b|\bretrospective\b|\bhandoff\b/iu.test(
    input.prompt,
  );
  const snapshot = /\bsnapshot\b|\bweekly update\b|\bstatus update\b|\bpersonal update\b|\bwork recap\b/iu.test(
    input.prompt,
  );

  if (deepDive !== snapshot) {
    return {
      mode: deepDive ? "deep-dive" : "snapshot",
      source: "inferred",
      needsConfirmation: false,
    };
  }
  if (input.generateNow === true) {
    return {
      mode: "snapshot",
      source: "generate-now-default",
      needsConfirmation: false,
    };
  }
  return { mode: undefined, source: "unresolved", needsConfirmation: true };
}

export function resolveReportingPeriod(input: PeriodResolutionInput): ResolvedReportingPeriod {
  if (input.explicitPeriod !== undefined) {
    const start = dateFromIso(input.explicitPeriod.start);
    const end = dateFromIso(input.explicitPeriod.end);
    if (start > end) throw new Error("The reporting period start must not follow its end.");
    return {
      start: isoDate(start),
      end: isoDate(end),
      label:
        input.explicitPeriod.label?.trim() || `${longDate(start)} through ${longDate(end)}`,
      cadence: "custom",
      source: "explicit",
    };
  }

  const current = dateFromIso(input.currentDate);
  const cadence = inferredCadence(input.prompt);

  if (cadence === "monthly") {
    const previous = /\b(?:last|previous) month\b/iu.test(input.prompt);
    const start = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - (previous ? 1 : 0), 1),
    );
    const end = previous
      ? new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 0))
      : current;
    return {
      start: isoDate(start),
      end: isoDate(end),
      label: monthYear(start),
      cadence,
      source: "inferred",
    };
  }

  if (cadence === "quarterly") {
    const quarter = Math.floor(current.getUTCMonth() / 3);
    const start = new Date(Date.UTC(current.getUTCFullYear(), quarter * 3, 1));
    const end = current;
    return {
      start: isoDate(start),
      end: isoDate(end),
      label: `Q${String(quarter + 1)} ${String(current.getUTCFullYear())}`,
      cadence,
      source: "inferred",
    };
  }

  const thisMonday = startOfWeek(current);
  const currentWeek = cadence === "weekly" && /\bthis week\b/iu.test(input.prompt);
  const start = currentWeek
    ? thisMonday
    : addDays(thisMonday, cadence === "biweekly" ? -14 : -7);
  const end = currentWeek ? current : addDays(thisMonday, -1);
  return {
    start: isoDate(start),
    end: isoDate(end),
    label:
      cadence === "biweekly"
        ? `Two weeks ending ${longDate(end)}`
        : `Week of ${longDate(start)}`,
    cadence,
    source: /\b(?:weekly|week|biweekly|bi-weekly|two[- ]week)\b/iu.test(input.prompt)
      ? "inferred"
      : "default",
  };
}

function resolveAudience(prompt: string, explicit: string | undefined): string {
  if (explicit?.trim()) return explicit.trim();
  if (/\bleadership\b|\bexecutive/u.test(prompt)) return "Leadership stakeholders";
  if (/\bmentor\b|\bcareer\b/iu.test(prompt)) return "The creator's mentor";
  return "The creator's manager and collaborators";
}

export function resolveReportRequest(input: ReportRequestInput): ResolvedReportRequest {
  const mode = resolveReportMode(input);
  const reportingPeriod = resolveReportingPeriod(input);
  const audience = resolveAudience(input.prompt, input.audience);
  const purpose =
    input.purpose?.trim() ||
    (mode.mode === "deep-dive"
      ? "Explain the selected body of work, its decisions, and implications."
      : "Explain meaningful movement, attention needed, and what happens next.");

  return {
    mode,
    audience,
    purpose,
    reportingPeriod,
    requiresPersistenceSetup: false,
  };
}
