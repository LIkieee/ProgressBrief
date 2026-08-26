import { readFileSync } from "node:fs";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import type { ContractValidationResult } from "./types.js";

export const SCHEMA_NAMES = [
  "design",
  "evidence",
  "feedback-queue",
  "knowledge-note",
  "report",
  "visualization",
  "worklog-entry",
  "workspace",
] as const;

export type SchemaName = (typeof SCHEMA_NAMES)[number];

const SCHEMA_BASE = "https://progressbrief.dev/schemas/v1/";

function readSchema(fileName: string): object {
  const contents = readFileSync(
    new URL(`../../schemas/${fileName}.schema.json`, import.meta.url),
    "utf8",
  );
  return JSON.parse(contents) as object;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(readSchema("common"));

for (const schemaName of SCHEMA_NAMES) {
  ajv.addSchema(readSchema(schemaName));
}

function validatorFor(schemaName: SchemaName): ValidateFunction {
  const validator = ajv.getSchema(`${SCHEMA_BASE}${schemaName}.schema.json`);
  if (validator === undefined) {
    throw new Error(`Schema validator is unavailable for ${schemaName}.`);
  }
  return validator;
}

function formatError(error: ErrorObject): string {
  const location = error.instancePath.length > 0 ? error.instancePath : "/";
  return `${location} ${error.message ?? "is invalid"}`;
}

export function validateDocument(
  schemaName: SchemaName,
  document: unknown,
): ContractValidationResult {
  const validator = validatorFor(schemaName);
  const valid = validator(document);

  return {
    valid,
    errors: valid ? [] : (validator.errors ?? []).map(formatError),
  };
}

export function assertValidDocument(schemaName: SchemaName, document: unknown): void {
  const result = validateDocument(schemaName, document);
  if (!result.valid) {
    throw new Error(`Invalid ${schemaName} document: ${result.errors.join("; ")}`);
  }
}
