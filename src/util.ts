import { randomUUID } from "node:crypto";
import path from "node:path";

export function nowIso(): string {
  return new Date().toISOString();
}

export function posterId(): string {
  return `poster_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomUUID().slice(0, 8)}`;
}

export function feedbackId(): string {
  return `feedback_${randomUUID().slice(0, 12)}`;
}

export function assertSafeId(id: string): void {
  if (!/^poster_[0-9]{8}_[a-zA-Z0-9-]{8}$/.test(id)) {
    throw new Error(`Invalid poster id: ${id}`);
  }
}

export function assertInside(parent: string, candidate: string): string {
  const parentResolved = path.resolve(parent);
  const resolved = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(parentResolved, candidate);
  const relative = path.relative(parentResolved, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolved;
  }
  throw new Error("Path traversal blocked");
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function includesPrice(content: unknown): boolean {
  return JSON.stringify(content).match(/(원|₩|[0-9],[0-9]{3})/) !== null;
}

export function normalizeArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
