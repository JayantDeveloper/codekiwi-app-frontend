import { useState, useEffect, useCallback } from "react";
import { BACKEND_BASE_URL } from "../config";
import { teacherHeaders } from "../teacherAuth";

/**
 * Manages editor lock state for a session. Fetches the initial state and
 * exposes a toggleLock function that POSTs to the backend.
 *
 * @param {string} sessionCode
 * @returns {{ editorsLocked: boolean, setEditorsLocked: Function, toggleLock: Function }}
 */
export function useLockEditor(sessionCode) {
  const [editorsLocked, setEditorsLocked] = useState(false);

  useEffect(() => {
    if (!sessionCode) return;
    fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/lock`)
      .then((res) => res.json())
      .then((data) => setEditorsLocked(!!data.locked))
      .catch(() => {});
  }, [sessionCode]);

  const fetchLockState = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/lock`);
      const { locked } = await res.json();
      setEditorsLocked(!!locked);
    } catch {}
  }, [sessionCode]);

  const toggleLock = useCallback(async () => {
    const newLocked = !editorsLocked;
    try {
      const resp = await fetch(
        `${BACKEND_BASE_URL}/api/sessions/${sessionCode}/lock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...teacherHeaders(sessionCode) },
          body: JSON.stringify({ locked: newLocked }),
        }
      );
      if (!resp.ok) throw new Error("Failed to set lock");
      setEditorsLocked(newLocked);
    } catch (e) {
      console.error(e);
      await fetchLockState();
      alert("Could not toggle editor lock. Please try again.");
    }
  }, [editorsLocked, sessionCode, fetchLockState]);

  return { editorsLocked, setEditorsLocked, toggleLock };
}
