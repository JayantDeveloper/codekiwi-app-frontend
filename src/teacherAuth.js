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
    const t = new URLSearchParams(window.location.search).get("t");
    if (t) sessionStorage.setItem(key(sessionCode), t);
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
