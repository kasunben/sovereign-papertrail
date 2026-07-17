'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** ~1.2s debounce, matching legacy sync.js (SPEC.md's Architecture section). */
const DEBOUNCE_MS = 1200;
/** Legacy sync.js's periodic retry interval — a fallback in case the `online` event doesn't fire (roadmap.md's step-11 notes). */
const RETRY_INTERVAL_MS = 5000;

export interface BoardSnapshot {
  version: number;
  nodes: unknown[];
  edges: unknown[];
}

function cacheKey(boardId: string): string {
  return `papertrail:board:${boardId}`;
}

/** localStorage is best-effort — quota errors, private-browsing restrictions, or SSR (no `window`) should degrade to "no cache", never throw. */
export function readCachedSnapshot(boardId: string): BoardSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(boardId));
    return raw ? (JSON.parse(raw) as BoardSnapshot) : null;
  } catch {
    return null;
  }
}

export function writeCachedSnapshot(boardId: string, snapshot: BoardSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(cacheKey(boardId), JSON.stringify(snapshot));
  } catch {
    // best-effort — a full quota shouldn't break editing
  }
}

export async function fetchBoardSnapshot(boardId: string): Promise<BoardSnapshot> {
  const response = await fetch(`/papertrail/api/boards/${boardId}`);
  if (!response.ok) throw new Error('Could not load the board.');
  return (await response.json()) as BoardSnapshot;
}

export type SaveOutcome =
  | { ok: true; version: number }
  | { ok: false; conflict: true; serverVersion: number }
  | { ok: false; conflict: false };

export async function saveBoardSnapshot(boardId: string, snapshot: BoardSnapshot): Promise<SaveOutcome> {
  try {
    const response = await fetch(`/papertrail/api/boards/${boardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (response.status === 409) {
      const body = (await response.json().catch(() => null)) as { version?: number } | null;
      return { ok: false, conflict: true, serverVersion: body?.version ?? snapshot.version };
    }
    if (!response.ok) return { ok: false, conflict: false };
    const body = (await response.json()) as { version: number };
    return { ok: true, version: body.version };
  } catch {
    return { ok: false, conflict: false };
  }
}

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'pending' | 'offline';

interface UseBoardSyncArgs {
  boardId: string;
  canEdit: boolean;
  getSnapshot: () => BoardSnapshot;
  onVersionChange: (version: number) => void;
}

/**
 * Debounced autosave + offline retry queue (PTR-11). A save that fails —
 * network error, or a 409 version conflict — just marks the board "pending"
 * and retries on the next `online` event or a 5s interval (legacy
 * sync.js's fallback for when `online` doesn't fire); it does not reload the
 * newer server state first. That reload-and-recover flow is PTR-12's job
 * ("the client surfaces a conflict notice and offers to reload the newer
 * server state") — layer it on top of the `conflict` status this hook
 * already reports, don't rebuild the retry mechanism.
 */
export function useBoardSync({ boardId, canEdit, getSnapshot, onVersionChange }: UseBoardSyncArgs) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [conflict, setConflict] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  const savingRef = useRef(false);
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  const flush = useCallback(async () => {
    if (!canEdit || savingRef.current) return;
    savingRef.current = true;
    setStatus('saving');

    const outcome = await saveBoardSnapshot(boardId, getSnapshotRef.current());
    savingRef.current = false;

    if (outcome.ok) {
      pendingRef.current = false;
      setConflict(false);
      onVersionChange(outcome.version);
      setStatus('saved');
      return;
    }

    pendingRef.current = true;
    setConflict(outcome.conflict);
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'pending');
  }, [boardId, canEdit, onVersionChange]);

  const scheduleSave = useCallback(() => {
    if (!canEdit) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, DEBOUNCE_MS);
  }, [canEdit, flush]);

  useEffect(() => {
    function handleOnline() {
      if (pendingRef.current) void flush();
    }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flush]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingRef.current) void flush();
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [flush]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { status, conflict, scheduleSave };
}
