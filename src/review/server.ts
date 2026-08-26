import { randomBytes, timingSafeEqual } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isAbsolute, basename, dirname, relative, resolve, sep } from "node:path";

import { assertValidReportModel } from "../contracts/report-semantics.js";
import type { ReportSourceModel } from "../contracts/types.js";
import {
  FeedbackQueueStore,
  componentTargetHashes,
  type FeedbackOperationInput,
  type FeedbackTarget,
} from "./feedback.js";
import { createFeedbackInvocations } from "./invocations.js";
import { renderReviewPage } from "./review-page.js";

const CLEAN_REPORT_CSP = "default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'self'; img-src data:; media-src data:; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'";
const MAX_REQUEST_BYTES = 64 * 1024;

export interface StartReviewServerOptions {
  allowedRoot: string;
  reportModelPath: string;
  reportHtmlPath: string;
  feedbackQueuePath: string;
  now?: () => string;
  uuidFactory?: () => string;
}

export interface ReviewServer {
  hostname: "127.0.0.1";
  port: number;
  origin: string;
  url: string;
  token: string;
  reportId: string;
  close: () => Promise<void>;
}

interface ResolvedReviewPaths {
  allowedRoot: string;
  reportModelPath: string;
  reportHtmlPath: string;
  feedbackQueuePath: string;
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

async function existingFileWithinRoot(root: string, path: string, label: string): Promise<string> {
  const resolvedPath = await realpath(resolve(path));
  if (!isWithin(root, resolvedPath)) {
    throw new Error(`${label} is outside the allowed review root.`);
  }
  const details = await stat(resolvedPath);
  if (!details.isFile()) throw new Error(`${label} must be a regular file.`);
  return resolvedPath;
}

async function queuePathWithinRoot(root: string, path: string): Promise<string> {
  const absolutePath = resolve(path);
  try {
    return await existingFileWithinRoot(root, absolutePath, "The feedback queue");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const parent = await realpath(dirname(absolutePath));
  const candidate = resolve(parent, basename(absolutePath));
  if (!isWithin(root, candidate)) {
    throw new Error("The feedback queue is outside the allowed review root.");
  }
  return candidate;
}

async function resolveReviewPaths(options: StartReviewServerOptions): Promise<ResolvedReviewPaths> {
  const allowedRoot = await realpath(resolve(options.allowedRoot));
  const rootDetails = await stat(allowedRoot);
  if (!rootDetails.isDirectory()) throw new Error("The allowed review root must be a directory.");
  const [reportModelPath, reportHtmlPath, feedbackQueuePath] = await Promise.all([
    existingFileWithinRoot(allowedRoot, options.reportModelPath, "The report model"),
    existingFileWithinRoot(allowedRoot, options.reportHtmlPath, "The clean report"),
    queuePathWithinRoot(allowedRoot, options.feedbackQueuePath),
  ]);
  return { allowedRoot, reportModelPath, reportHtmlPath, feedbackQueuePath };
}

async function readReportModel(path: string, expectedReportId?: string): Promise<ReportSourceModel> {
  const document: unknown = JSON.parse(await readFile(path, "utf8"));
  assertValidReportModel(document);
  if (expectedReportId !== undefined && document.id !== expectedReportId) {
    throw new Error("The selected report model changed identity during review.");
  }
  return document;
}

function tokenMatches(candidate: string | undefined, expected: string): boolean {
  if (candidate === undefined) return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

function candidateToken(request: IncomingMessage, url: URL): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ") === true) return authorization.slice(7);
  return url.searchParams.get("token") ?? undefined;
}

function writeSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendText(response: ServerResponse, status: number, text: string): void {
  writeSecurityHeaders(response);
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  writeSecurityHeaders(response);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string"
      ? Buffer.from(chunk)
      : Buffer.from(chunk as Uint8Array);
    size += bytes.byteLength;
    if (size > MAX_REQUEST_BYTES) throw new Error("The feedback request exceeds 64 KiB.");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function parseTarget(value: unknown): FeedbackTarget {
  if (value === null || typeof value !== "object") throw new Error("Feedback target is required.");
  const target = value as Record<string, unknown>;
  if (typeof target.componentId !== "string" || typeof target.contentHash !== "string") {
    throw new Error("Feedback target componentId and contentHash are required.");
  }
  if (target.selectedText !== undefined && typeof target.selectedText !== "string") {
    throw new Error("Feedback selectedText must be a string.");
  }
  return {
    componentId: target.componentId,
    ...(target.selectedText === undefined ? {} : { selectedText: target.selectedText }),
    contentHash: target.contentHash,
  };
}

function parseFeedbackInput(value: unknown): { reportId: string; input: FeedbackOperationInput } {
  if (value === null || typeof value !== "object") throw new Error("Feedback body must be an object.");
  const body = value as Record<string, unknown>;
  if (typeof body.reportId !== "string" || typeof body.request !== "string") {
    throw new Error("Feedback reportId and request are required.");
  }
  if (body.kind !== "annotation" && body.kind !== "inline-edit") {
    throw new Error("Feedback kind must be annotation or inline-edit.");
  }
  if (body.replacementText !== undefined && typeof body.replacementText !== "string") {
    throw new Error("Feedback replacementText must be a string.");
  }
  return {
    reportId: body.reportId,
    input: {
      kind: body.kind,
      target: parseTarget(body.target),
      request: body.request,
      ...(body.replacementText === undefined ? {} : { replacementText: body.replacementText }),
    },
  };
}

export async function startReviewServer(options: StartReviewServerOptions): Promise<ReviewServer> {
  const paths = await resolveReviewPaths(options);
  const initialReport = await readReportModel(paths.reportModelPath);
  const initialHtml = await readFile(paths.reportHtmlPath, "utf8");
  if (!initialHtml.includes(`data-report-id="${initialReport.id}"`)) {
    throw new Error("The clean report HTML does not match the selected report model.");
  }
  const token = randomBytes(32).toString("hex");
  const invocations = createFeedbackInvocations({
    feedbackQueuePath: paths.feedbackQueuePath,
    reportModelPath: paths.reportModelPath,
    reportHtmlPath: paths.reportHtmlPath,
  });
  const queueStore = new FeedbackQueueStore({
    queuePath: paths.feedbackQueuePath,
    reportId: initialReport.id,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.uuidFactory === undefined ? {} : { uuidFactory: options.uuidFactory }),
  });
  await queueStore.read();
  const eventClients = new Set<ServerResponse>();
  const watchers: FSWatcher[] = [];
  let expectedHost = "";
  let expectedOrigin = "";

  const server = createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? "/", expectedOrigin);
      const origin = request.headers.origin;
      if (request.headers.host !== expectedHost) {
        sendText(response, 403, "Forbidden review authority.");
        return;
      }
      if (origin !== undefined && origin !== expectedOrigin) {
        sendText(response, 403, "Forbidden review origin.");
        return;
      }
      if (!tokenMatches(candidateToken(request, requestUrl), token)) {
        sendText(response, 401, "Unauthorized review request.");
        return;
      }

      const reportPath = `/reports/${initialReport.id}`;
      const feedbackPath = `/api/reports/${initialReport.id}/feedback`;
      const eventsPath = `/events/${initialReport.id}`;

      if (request.method === "GET" && requestUrl.pathname === "/") {
        const currentReport = await readReportModel(paths.reportModelPath, initialReport.id);
        const nonce = randomBytes(18).toString("base64url");
        const html = renderReviewPage({
          reportId: initialReport.id,
          token,
          reportUrl: `${reportPath}?token=${token}`,
          feedbackUrl: `${feedbackPath}?token=${token}`,
          eventsUrl: `${eventsPath}?token=${token}`,
          componentHashes: componentTargetHashes(currentReport),
          invocations,
        }, nonce);
        writeSecurityHeaders(response);
        response.setHeader("Content-Security-Policy", `default-src 'none'; base-uri 'none'; connect-src 'self'; frame-src 'self'; form-action 'none'; img-src 'none'; object-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'`);
        response.setHeader("X-Frame-Options", "DENY");
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === reportPath) {
        const html = await readFile(paths.reportHtmlPath, "utf8");
        writeSecurityHeaders(response);
        response.setHeader("Content-Security-Policy", CLEAN_REPORT_CSP);
        response.setHeader("X-Frame-Options", "SAMEORIGIN");
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === eventsPath) {
        writeSecurityHeaders(response);
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          connection: "keep-alive",
        });
        response.write("retry: 1000\n\n");
        eventClients.add(response);
        request.on("close", () => eventClients.delete(response));
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === feedbackPath) {
        sendJson(response, 200, (await queueStore.read()) ?? null);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === feedbackPath) {
        if (origin !== expectedOrigin) {
          sendText(response, 403, "A same-origin request is required.");
          return;
        }
        if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
          sendText(response, 415, "Feedback requests must use application/json.");
          return;
        }
        try {
          const parsed = parseFeedbackInput(await readJsonBody(request));
          if (parsed.reportId !== initialReport.id) {
            sendJson(response, 409, { error: "The feedback operation identifies a different report." });
            return;
          }
          const report = await readReportModel(paths.reportModelPath, initialReport.id);
          const queue = await queueStore.append(report, parsed.input);
          sendJson(response, 201, queue);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid feedback operation.";
          sendJson(response, 400, { error: message });
        }
        return;
      }

      sendText(response, 404, "Review resource not found.");
    })().catch(() => {
      if (!response.headersSent) sendText(response, 500, "The review request could not be completed.");
      else response.destroy();
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("The loopback review server did not receive a TCP port.");
  }
  const port = address.port;
  expectedHost = `127.0.0.1:${String(port)}`;
  expectedOrigin = `http://${expectedHost}`;

  const watchedNames = new Map<string, Set<string>>();
  for (const path of [paths.reportModelPath, paths.reportHtmlPath]) {
    const directory = dirname(path);
    const names = watchedNames.get(directory) ?? new Set<string>();
    names.add(basename(path));
    watchedNames.set(directory, names);
  }
  for (const [directory, names] of watchedNames) {
    watchers.push(watch(directory, { persistent: false }, (_event, fileName) => {
      if (fileName === null || !names.has(fileName.toString())) return;
      const data = JSON.stringify({ reportId: initialReport.id });
      for (const client of eventClients) client.write(`event: reload\ndata: ${data}\n\n`);
    }));
  }

  return {
    hostname: "127.0.0.1",
    port,
    origin: expectedOrigin,
    url: `${expectedOrigin}/?token=${token}`,
    token,
    reportId: initialReport.id,
    close: async () => {
      for (const watcher of watchers) watcher.close();
      for (const client of eventClients) client.end();
      eventClients.clear();
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
        server.closeIdleConnections();
      });
    },
  };
}
