import { useCallback, useEffect, useRef, useState } from "react";
import { BACKEND_BASE_URL } from "../config";
import { captureTeacherToken, getTeacherToken } from "../teacherAuth";

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * Opens a WebSocket for the session, joins it, and dispatches incoming
 * messages to `onMessage`. Reconnects with backoff after any drop and
 * re-joins on open (the server replies with sync + lock + demo state, so the
 * client resyncs for free). Messages sent while disconnected are queued and
 * flushed on reconnect, so a teacher's slide change is never silently lost.
 *
 * @param {string} sessionCode
 * @param {(data: object) => void} onMessage
 * @param {{ studentId?: string, teacher?: boolean, enabled?: boolean }} [opts]
 * @returns {{ send: (payload: object) => void, status: "connecting"|"open"|"reconnecting"|"closed" }}
 */
export function useSessionWebSocket(sessionCode, onMessage, opts = {}) {
  const { studentId = null, teacher = false, enabled = true } = opts;
  const wsRef = useRef(null);
  const queueRef = useRef([]);
  const attemptRef = useRef(0);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState("connecting");
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const send = useCallback((payload) => {
    const msg = JSON.stringify(payload);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(msg);
    else queueRef.current.push(msg);
  }, []);

  useEffect(() => {
    if (!sessionCode || !enabled) return;
    stoppedRef.current = false;
    attemptRef.current = 0;
    if (teacher) captureTeacherToken(sessionCode);
    let timer = null;

    const connect = () => {
      if (stoppedRef.current) return;
      const ws = new WebSocket(BACKEND_BASE_URL.replace(/^http/, "ws"));
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus("open");
        const join = { type: "join", sessionCode };
        if (studentId) join.studentId = studentId;
        if (teacher) join.t = getTeacherToken(sessionCode);
        ws.send(JSON.stringify(join));
        const pending = queueRef.current;
        queueRef.current = [];
        pending.forEach((m) => ws.send(m));
      };
      ws.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data));
        } catch (e) {
          console.error("WS parse error", e);
        }
      };
      ws.onerror = () => {}; // close always follows; handled there
      ws.onclose = () => {
        if (stoppedRef.current) return;
        setStatus("reconnecting");
        const delay = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)];
        attemptRef.current += 1;
        timer = setTimeout(connect, delay + Math.random() * 500);
      };
    };
    connect();

    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
      setStatus("closed");
      try { wsRef.current?.close(); } catch {}
    };
  }, [sessionCode, studentId, teacher, enabled]);

  return { send, status };
}
