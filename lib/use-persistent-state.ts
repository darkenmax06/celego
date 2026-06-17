"use client";

import { Dispatch, SetStateAction, useEffect, useState } from "react";

type StoredValue<T> = {
  version: 1;
  value: T;
};

const PREFIX = "celego:workspace:v1:";

export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState(initialValue);
  const storageKey = `${PREFIX}${key}`;
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);

  useEffect(() => {
    setHydratedStorageKey(null);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredValue<T>;
        if (parsed.version === 1) {
          setValue(parsed.value);
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setHydratedStorageKey(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    const stored: StoredValue<T> = { version: 1, value };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch {
      return;
    }
  }, [hydratedStorageKey, storageKey, value]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as StoredValue<T>;
        if (parsed.version === 1) setValue(parsed.value);
      } catch {
        return;
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  return [value, setValue, hydratedStorageKey === storageKey];
}
