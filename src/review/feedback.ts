import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { createStableId, isStableId } from "../contracts/ids.js";
import { assertValidReportModel } from "../contracts/report-semantics.js";
import { assertValidDocument } from "../contracts/schema-validator.js";
import { advanceRevision } from "../contracts/revisions.js";
import type { ReportSourceModel } from "../contracts/types.js";

export interface FeedbackTarget {
  componentId: string;
  selectedText?: string;
  contentHash: string;
}

export interface FeedbackItem {
  id: string;
  kind: "annotation" | "inline-edit";
  target: FeedbackTarget;
  request: string;
  replacementText?: string;
  status: "pending" | "applied" | "conflict";
  createdAt: string;
}

export interface FeedbackQueue {
  schemaVersion: "1.0.0";
  id: string;
  reportId: string;
  reportRevision: number;
  queueVersion: number;
  updatedAt: string;
  items: FeedbackItem[];
}

export type FeedbackOperationInput = Omit<FeedbackItem, "id" | "status" | "createdAt">;

export interface FeedbackQueueStoreOptions {
  queuePath: string;
  reportId: string;
  now?: () => string;
  uuidFactory?: () => string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function componentFor(
  report: ReportSourceModel,
  componentId: string,
): ReportSourceModel["components"][number] {
  if (!isStableId("component", componentId)) {
    throw new Error("Feedback target componentId must be a stable component ID.");
  }
  const component = report.components.find(({ id }) => id === componentId);
  if (component === undefined) {
    throw new Error(`Feedback target component ${componentId} is not present in report ${report.id}.`);
  }
  return component;
}

function reviewContent(
  report: ReportSourceModel,
  componentId: string,
): { component: ReportSourceModel["components"][number]; visualization?: ReportSourceModel["visualizations"][number] } {
  const component = componentFor(report, componentId);
  const visualization = component.visualizationId === undefined
    ? undefined
    : report.visualizations.find(({ id }) => id === component.visualizationId);
  return {
    component,
    ...(visualization === undefined ? {} : { visualization }),
  };
}

function componentText(report: ReportSourceModel, componentId: string): string {
  const { component, visualization } = reviewContent(report, componentId);
  const text = [component.heading, component.body, ...(component.items ?? [])];
  if (visualization !== undefined) {
    text.push(visualization.title, visualization.purpose);
    for (const item of visualization.data.items ?? []) {
      text.push(item.label, item.description, item.unit, item.start, item.end);
    }
    for (const relationship of visualization.data.relationships ?? []) {
      text.push(relationship.from, relationship.to, relationship.label);
    }
    if (visualization.textAlternative.type === "prose") {
      text.push(visualization.textAlternative.content);
    } else {
      text.push(...visualization.textAlternative.columns, ...visualization.textAlternative.rows.flat());
    }
  }
  return text.filter((value): value is string => value !== undefined).join("\n");
}

function currentTargetMatches(report: ReportSourceModel, target: FeedbackTarget): boolean {
  try {
    if (componentContentHash(report, target.componentId) !== target.contentHash) return false;
    return target.selectedText === undefined || componentText(report, target.componentId).includes(target.selectedText);
  } catch {
    return false;
  }
}

function assertFeedbackInput(report: ReportSourceModel, input: FeedbackOperationInput): void {
  componentFor(report, input.target.componentId);
  if (!/^[0-9a-f]{64}$/u.test(input.target.contentHash)) {
    throw new Error("Feedback target contentHash must be a SHA-256 digest.");
  }
  if (input.target.selectedText !== undefined) {
    if (input.target.selectedText.length === 0 || input.target.selectedText.length > 2000) {
      throw new Error("Feedback selected text must contain 1 through 2000 characters.");
    }
  }
  if (input.request.trim().length === 0 || input.request.length > 4000) {
    throw new Error("Feedback requests must contain 1 through 4000 characters.");
  }
  if (input.kind === "inline-edit") {
    if (input.target.selectedText === undefined) {
      throw new Error("An inline edit requires selected text context.");
    }
    if (input.replacementText === undefined || input.replacementText.length > 10_000) {
      throw new Error("An inline edit requires replacement text of at most 10000 characters.");
    }
  } else if (input.replacementText !== undefined) {
    throw new Error("An annotation must not contain replacement text.");
  }
}

async function writeQueueAtomically(queuePath: string, queue: FeedbackQueue): Promise<void> {
  const directory = dirname(queuePath);
  const temporaryPath = join(
    directory,
    `.${basename(queuePath)}.${String(process.pid)}.${randomUUID()}.tmp`,
  );
  await mkdir(directory, { recursive: true });
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(queue, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, queuePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export function componentContentHash(reportDocument: unknown, componentId: string): string {
  assertValidReportModel(reportDocument);
  const content = reviewContent(reportDocument, componentId);
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(content)))
    .digest("hex");
}

export function createFeedbackTarget(
  reportDocument: unknown,
  componentId: string,
  selectedText?: string,
): FeedbackTarget {
  assertValidReportModel(reportDocument);
  if (selectedText !== undefined && !componentText(reportDocument, componentId).includes(selectedText)) {
    throw new Error(`Feedback selected text is not present in component ${componentId}.`);
  }
  return {
    componentId,
    ...(selectedText === undefined ? {} : { selectedText }),
    contentHash: componentContentHash(reportDocument, componentId),
  };
}

export function componentTargetHashes(reportDocument: unknown): Record<string, string> {
  assertValidReportModel(reportDocument);
  return Object.fromEntries(
    reportDocument.components.map(({ id }) => [id, componentContentHash(reportDocument, id)]),
  );
}

export function reconcileFeedbackQueue(
  queue: FeedbackQueue,
  reportDocument: unknown,
  updatedAt: string,
): FeedbackQueue {
  assertValidDocument("feedback-queue", queue);
  assertValidReportModel(reportDocument);
  if (queue.reportId !== reportDocument.id) {
    throw new Error(`Feedback queue ${queue.id} belongs to a different report.`);
  }
  let changed = false;
  const items = queue.items.map((item) => {
    if (item.status !== "pending" || currentTargetMatches(reportDocument, item.target)) {
      return structuredClone(item);
    }
    changed = true;
    return { ...structuredClone(item), status: "conflict" as const };
  });
  if (!changed) return structuredClone(queue);
  const reconciled = {
    ...structuredClone(queue),
    queueVersion: queue.queueVersion + 1,
    updatedAt,
    items,
  };
  assertValidDocument("feedback-queue", reconciled);
  return reconciled;
}

function occurrences(value: string, selectedText: string): number {
  let count = 0;
  let position = value.indexOf(selectedText);
  while (position !== -1) {
    count += 1;
    position = value.indexOf(selectedText, position + selectedText.length);
  }
  return count;
}

export function applyInlineEditFeedback(
  reportDocument: unknown,
  item: FeedbackItem,
  createdAt: string,
): ReportSourceModel {
  assertValidReportModel(reportDocument);
  if (item.kind !== "inline-edit" || item.replacementText === undefined || item.target.selectedText === undefined) {
    throw new Error("Only a complete inline-edit feedback item can use the literal correction helper.");
  }
  if (item.status !== "pending" || !currentTargetMatches(reportDocument, item.target)) {
    throw new Error("Feedback target conflict: the component changed before the inline edit was applied.");
  }
  const componentIndex = reportDocument.components.findIndex(({ id }) => id === item.target.componentId);
  const component = reportDocument.components[componentIndex];
  if (component === undefined) {
    throw new Error("Feedback target conflict: the component is no longer present.");
  }
  const selectedText = item.target.selectedText;
  const editableValues = [component.heading, component.body, ...(component.items ?? [])]
    .filter((value): value is string => value !== undefined);
  const matchCount = editableValues.reduce(
    (total, value) => total + occurrences(value, selectedText),
    0,
  );
  if (matchCount !== 1) {
    throw new Error("Feedback target conflict: selected text is not uniquely editable in the component.");
  }
  const revised = structuredClone(reportDocument);
  const revisedComponent = structuredClone(component);
  if (revisedComponent.heading?.includes(selectedText) === true) {
    revisedComponent.heading = revisedComponent.heading.replace(selectedText, item.replacementText);
  } else if (revisedComponent.body?.includes(selectedText) === true) {
    revisedComponent.body = revisedComponent.body.replace(selectedText, item.replacementText);
  } else if (revisedComponent.items !== undefined) {
    revisedComponent.items = revisedComponent.items.map((value) =>
      value.includes(selectedText) ? value.replace(selectedText, item.replacementText ?? "") : value,
    );
  }
  revised.components[componentIndex] = revisedComponent;
  const advanced = advanceRevision(
    revised,
    createdAt,
    `Applied inline feedback ${item.id} to component ${item.target.componentId}.`,
  );
  assertValidReportModel(advanced);
  return advanced;
}

export class FeedbackQueueStore {
  readonly #options: Required<Omit<FeedbackQueueStoreOptions, "now" | "uuidFactory">> & {
    now: () => string;
    uuidFactory: () => string;
  };
  #mutationTail: Promise<void> = Promise.resolve();

  constructor(options: FeedbackQueueStoreOptions) {
    this.#options = {
      queuePath: options.queuePath,
      reportId: options.reportId,
      now: options.now ?? (() => new Date().toISOString()),
      uuidFactory: options.uuidFactory ?? randomUUID,
    };
  }

  async read(): Promise<FeedbackQueue | undefined> {
    let contents: string;
    try {
      contents = await readFile(this.#options.queuePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const queue = JSON.parse(contents) as FeedbackQueue;
    assertValidDocument("feedback-queue", queue);
    if (queue.reportId !== this.#options.reportId) {
      throw new Error("The selected feedback queue belongs to a different report.");
    }
    return queue;
  }

  append(reportDocument: unknown, input: FeedbackOperationInput): Promise<FeedbackQueue> {
    const operation = this.#mutationTail.then(() => this.#appendNow(reportDocument, input));
    this.#mutationTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  updateItemStatus(itemId: string, status: FeedbackItem["status"]): Promise<FeedbackQueue> {
    const operation = this.#mutationTail.then(() => this.#updateItemStatusNow(itemId, status));
    this.#mutationTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  reconcile(reportDocument: unknown): Promise<FeedbackQueue | undefined> {
    const operation = this.#mutationTail.then(() => this.#reconcileNow(reportDocument));
    this.#mutationTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async #appendNow(reportDocument: unknown, input: FeedbackOperationInput): Promise<FeedbackQueue> {
    assertValidReportModel(reportDocument);
    if (reportDocument.id !== this.#options.reportId) {
      throw new Error("The feedback operation identifies a different report.");
    }
    assertFeedbackInput(reportDocument, input);
    const existing = await this.read();
    const timestamp = this.#options.now();
    const item: FeedbackItem = {
      id: createStableId("feedback", this.#options.uuidFactory),
      kind: input.kind,
      target: structuredClone(input.target),
      request: input.request,
      ...(input.replacementText === undefined ? {} : { replacementText: input.replacementText }),
      status: currentTargetMatches(reportDocument, input.target) ? "pending" : "conflict",
      createdAt: timestamp,
    };
    const queue: FeedbackQueue = existing === undefined
      ? {
          schemaVersion: "1.0.0",
          id: createStableId("feedbackQueue", this.#options.uuidFactory),
          reportId: reportDocument.id,
          reportRevision: reportDocument.revision,
          queueVersion: 1,
          updatedAt: timestamp,
          items: [item],
        }
      : {
          ...structuredClone(existing),
          queueVersion: existing.queueVersion + 1,
          updatedAt: timestamp,
          items: [...existing.items.map((candidate) => structuredClone(candidate)), item],
        };
    assertValidDocument("feedback-queue", queue);
    await writeQueueAtomically(this.#options.queuePath, queue);
    return queue;
  }

  async #updateItemStatusNow(
    itemId: string,
    status: FeedbackItem["status"],
  ): Promise<FeedbackQueue> {
    if (!isStableId("feedback", itemId)) throw new Error("Feedback item ID is invalid.");
    const existing = await this.read();
    if (existing === undefined) throw new Error("The feedback queue does not exist.");
    const itemIndex = existing.items.findIndex(({ id }) => id === itemId);
    if (itemIndex === -1) throw new Error(`Feedback item ${itemId} is not in the selected queue.`);
    if (existing.items[itemIndex]?.status === status) return structuredClone(existing);
    const queue = structuredClone(existing);
    const item = queue.items[itemIndex];
    if (item === undefined) throw new Error("The feedback item changed during queue mutation.");
    item.status = status;
    queue.queueVersion += 1;
    queue.updatedAt = this.#options.now();
    assertValidDocument("feedback-queue", queue);
    await writeQueueAtomically(this.#options.queuePath, queue);
    return queue;
  }

  async #reconcileNow(reportDocument: unknown): Promise<FeedbackQueue | undefined> {
    const existing = await this.read();
    if (existing === undefined) return undefined;
    const reconciled = reconcileFeedbackQueue(existing, reportDocument, this.#options.now());
    if (reconciled.queueVersion !== existing.queueVersion) {
      await writeQueueAtomically(this.#options.queuePath, reconciled);
    }
    return reconciled;
  }
}
