import { randomUUID } from "node:crypto";

export const ID_PREFIXES = {
  report: "rpt_",
  section: "sec_",
  component: "cmp_",
  claim: "clm_",
  source: "src_",
  visualization: "viz_",
  feedback: "fbk_",
  design: "dsg_",
  workspace: "wsp_",
  project: "prj_",
  worklogEntry: "wlg_",
  knowledgeNote: "knw_",
  feedbackQueue: "fbq_",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function createStableId(
  kind: IdKind,
  uuidFactory: () => string = randomUUID,
): string {
  const uuid = uuidFactory();

  if (!UUID_V4.test(uuid)) {
    throw new Error(`Cannot create a ${kind} ID: the UUID factory did not return a UUID v4.`);
  }

  return `${ID_PREFIXES[kind]}${uuid}`;
}

export function isStableId(kind: IdKind, value: unknown): value is string {
  if (typeof value !== "string") return false;

  const prefix = ID_PREFIXES[kind];
  return value.startsWith(prefix) && UUID_V4.test(value.slice(prefix.length));
}
