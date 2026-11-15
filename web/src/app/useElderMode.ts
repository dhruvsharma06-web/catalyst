import { useCallback, useEffect, useState } from "react";
import type { Role } from "../api/types";
import { readStorage, writeStorage } from "./util/storage";

const KEY = "hearth.elderMode";

/** Large-type mode: saved choice wins; otherwise on by default for the elder. */
export function useElderMode(role: Role): { enabled: boolean; toggle: () => void } {
  const [enabled, setEnabled] = useState<boolean>(() => {
    const saved = readStorage(KEY);
    return saved === null ? role === "elder" : saved === "true";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (enabled) root.dataset["elder"] = "true";
    else delete root.dataset["elder"];
    return () => {
      delete root.dataset["elder"];
    };
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      writeStorage(KEY, String(!prev));
      return !prev;
    });
  }, []);

  return { enabled, toggle };
}
