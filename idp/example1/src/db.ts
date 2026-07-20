/**
 * Simple in-memory store for IDP identity data.
 * In production, use a persistent database.
 */
import type { AccessorRecord, ReferenceRecord } from './types';

const references = new Map<string, ReferenceRecord>();
const accessors = new Map<string, AccessorRecord>();

// ─── References ───────────────────────────────────────────────────────────────

export function getReference(referenceId: string): ReferenceRecord | undefined {
  return references.get(referenceId);
}

export function addOrUpdateReference(
  referenceId: string,
  data: Partial<ReferenceRecord>,
): void {
  const existing = references.get(referenceId);
  references.set(referenceId, { id: referenceId, ...existing, ...data });
}

export function removeReference(referenceId: string): void {
  references.delete(referenceId);
}

// ─── Accessors ────────────────────────────────────────────────────────────────

export function getAccessor(accessorId: string): AccessorRecord | undefined {
  return accessors.get(accessorId);
}

export function addAccessor(record: AccessorRecord): void {
  accessors.set(record.accessor_id, record);
}

export function getAccessorByIdentifier(
  namespace: string,
  identifier: string,
): AccessorRecord | undefined {
  for (const record of accessors.values()) {
    if (record.namespace === namespace && record.identifier === identifier) {
      return record;
    }
  }
  return undefined;
}
