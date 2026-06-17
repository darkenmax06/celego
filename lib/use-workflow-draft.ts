"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WorkflowDraftStatus =
  | "loading"
  | "idle"
  | "restored"
  | "saving"
  | "saved"
  | "conflict"
  | "error";

type DraftRecord<T> = {
  module: string;
  contextKey: string;
  payload: T;
  version: number;
  updatedAt: string;
};

type Options<T extends Record<string, unknown>> = {
  module: string;
  contextKey?: string;
  payload: T;
  onRestore: (payload: T) => void;
  enabled?: boolean;
  shouldSave?: boolean;
  debounceMs?: number;
};

export function useWorkflowDraft<T extends Record<string, unknown>>({
  module,
  contextKey = "default",
  payload,
  onRestore,
  enabled = true,
  shouldSave = true,
  debounceMs = 900,
}: Options<T>) {
  const [status, setStatus] = useState<WorkflowDraftStatus>("loading");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [remoteDraft, setRemoteDraft] = useState<DraftRecord<T> | null>(null);
  const [flushTick, setFlushTick] = useState(0);
  const restoreRef = useRef(onRestore);
  const payloadJson = JSON.stringify(payload);
  const payloadJsonRef = useRef(payloadJson);
  const loadedRef = useRef(false);
  const versionRef = useRef(0);
  const lastSavedJsonRef = useRef("");
  const expectedRestoreJsonRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);

  useEffect(() => {
    restoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    payloadJsonRef.current = payloadJson;
  }, [payloadJson]);

  const flush = useCallback(async () => {
    if (!enabled || !shouldSave || !loadedRef.current || savingRef.current || remoteDraft) return;
    const nextJson = payloadJsonRef.current;
    if (nextJson === lastSavedJsonRef.current) return;

    savingRef.current = true;
    setStatus("saving");
    try {
      const response = await fetch("/api/workflow-drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          contextKey,
          payload: JSON.parse(nextJson) as T,
          version: versionRef.current,
        }),
      });
      const json = await response.json().catch(() => ({ error: "No se pudo guardar el progreso" }));

      if (response.status === 409) {
        conflictRef.current = true;
        setRemoteDraft((json.draft ?? null) as DraftRecord<T> | null);
        setStatus("conflict");
        return;
      }
      if (!response.ok || !json.draft) {
        setStatus("error");
        return;
      }

      const saved = json.draft as DraftRecord<T>;
      versionRef.current = saved.version;
      lastSavedJsonRef.current = nextJson;
      setUpdatedAt(saved.updatedAt);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      savingRef.current = false;
      if (payloadJsonRef.current !== lastSavedJsonRef.current && !conflictRef.current) {
        setFlushTick((current) => current + 1);
      }
    }
  }, [contextKey, enabled, module, remoteDraft, shouldSave]);

  useEffect(() => {
    if (!enabled) {
      loadedRef.current = false;
      setStatus("idle");
      return;
    }

    let cancelled = false;
    loadedRef.current = false;
    versionRef.current = 0;
    setStatus("loading");
    setRemoteDraft(null);
    conflictRef.current = false;

    void (async () => {
      const params = new URLSearchParams({ module, contextKey });
      try {
        const response = await fetch(`/api/workflow-drafts?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await response.json().catch(() => ({ draft: null }));
        if (cancelled) return;
        if (!response.ok) {
          setStatus("error");
          return;
        }

        const draft = (json.draft ?? null) as DraftRecord<T> | null;
        if (draft) {
          const restoredJson = JSON.stringify(draft.payload);
          versionRef.current = draft.version;
          lastSavedJsonRef.current = restoredJson;
          expectedRestoreJsonRef.current = restoredJson;
          restoreRef.current(draft.payload);
          setUpdatedAt(draft.updatedAt);
          setStatus("restored");
        } else {
          lastSavedJsonRef.current = payloadJsonRef.current;
          setStatus("idle");
        }
        loadedRef.current = true;
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contextKey, enabled, module]);

  useEffect(() => {
    if (!enabled || !shouldSave || !loadedRef.current || remoteDraft) return;
    if (expectedRestoreJsonRef.current) {
      if (payloadJson !== expectedRestoreJsonRef.current) return;
      expectedRestoreJsonRef.current = null;
      return;
    }
    if (payloadJson === lastSavedJsonRef.current) return;

    const timeoutId = window.setTimeout(() => void flush(), debounceMs);
    return () => window.clearTimeout(timeoutId);
  }, [debounceMs, enabled, flush, flushTick, payloadJson, remoteDraft, shouldSave]);

  const clearDraft = useCallback(async () => {
    await fetch("/api/workflow-drafts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module, contextKey }),
    });
    versionRef.current = 0;
    lastSavedJsonRef.current = payloadJsonRef.current;
    expectedRestoreJsonRef.current = null;
    setRemoteDraft(null);
    conflictRef.current = false;
    setUpdatedAt(null);
    setStatus("idle");
  }, [contextKey, module]);

  const useRemoteVersion = useCallback(() => {
    if (!remoteDraft) return;
    const restoredJson = JSON.stringify(remoteDraft.payload);
    versionRef.current = remoteDraft.version;
    lastSavedJsonRef.current = restoredJson;
    expectedRestoreJsonRef.current = restoredJson;
    restoreRef.current(remoteDraft.payload);
    setUpdatedAt(remoteDraft.updatedAt);
    setRemoteDraft(null);
    conflictRef.current = false;
    setStatus("restored");
  }, [remoteDraft]);

  const overwriteRemote = useCallback(() => {
    if (!remoteDraft) return;
    versionRef.current = remoteDraft.version;
    lastSavedJsonRef.current = JSON.stringify(remoteDraft.payload);
    setRemoteDraft(null);
    conflictRef.current = false;
    setStatus("idle");
    window.setTimeout(() => void flush(), 0);
  }, [flush, remoteDraft]);

  return {
    status,
    updatedAt,
    clearDraft,
    useRemoteVersion,
    overwriteRemote,
  };
}
