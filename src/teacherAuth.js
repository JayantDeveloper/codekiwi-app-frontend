// Teacher token handling. The add-on opens the teacher view at
// /teacher/<code>?t=<token>. We stash the token in sessionStorage (keyed by
// session code) so it survives navigation to the dashboard / inspect sub-routes
// in the same tab, and attach it as the x-teacher-token header on teacher-only
// requests. Students never receive this token.

const key = (sessionCode) => `ck-teacher-${sessionCode}`;

/** Read ?t= from the current URL (if present) and persist it for this session. */
export function captureTeacherToken(sessionCode) {
  if (!sessionCode) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (t) {
      sessionStorage.setItem(key(sessionCode), t);
      // Never leave the token on a projected address bar / in history.
      params.delete("t");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
  } catch {}
}

export function getTeacherToken(sessionCode) {
  try {
    return sessionStorage.getItem(key(sessionCode)) || "";
  } catch {
    return "";
  }
}

/** Headers to spread into a fetch for teacher-only endpoints. */
export function teacherHeaders(sessionCode) {
  const t = getTeacherToken(sessionCode);
  return t ? { "x-teacher-token": t } : {};
}
