// Teacher token handling. The add-on opens the teacher view at
// /teacher/<code>?t=<token>. The token is kept in memory for this page load
// (it survives SPA navigation to the dashboard / inspect sub-routes) and, where
// the browser allows it, mirrored into sessionStorage so a refresh keeps it.
// It is attached as the x-teacher-token header on teacher-only requests.
// Students never receive this token.
//
// sessionStorage is only a convenience: it throws on browsers with cookies or
// site data blocked (managed school Chromebooks, strict privacy settings), and
// when it did, every teacher request went out unauthenticated and the whole
// teacher view silently stopped working.

const key = (sessionCode) => `ck-teacher-${sessionCode}`;
const memory = new Map(); // sessionCode -> token

function readStorage(sessionCode) {
  try {
    return sessionStorage.getItem(key(sessionCode)) || "";
  } catch {
    return "";
  }
}

function writeStorage(sessionCode, token) {
  try {
    sessionStorage.setItem(key(sessionCode), token);
    return sessionStorage.getItem(key(sessionCode)) === token;
  } catch {
    return false;
  }
}

/** Read ?t= from the current URL (if present) and hold it for this session. */
export function captureTeacherToken(sessionCode) {
  if (!sessionCode) return;
  const params = new URLSearchParams(window.location.search);
  const t = params.get("t");
  if (!t) return;
  memory.set(sessionCode, t);
  // Only take the token off the address bar (so it isn't projected or kept in
  // history) once a refresh can still find it. Otherwise leave it in the URL:
  // a visible token beats a teacher view that breaks on reload.
  if (writeStorage(sessionCode, t)) {
    params.delete("t");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  }
}

export function getTeacherToken(sessionCode) {
  if (!sessionCode) return "";
  if (!memory.has(sessionCode)) {
    const stored = readStorage(sessionCode);
    if (stored) memory.set(sessionCode, stored);
    else captureTeacherToken(sessionCode);
  }
  return memory.get(sessionCode) || "";
}

/** Headers to spread into a fetch for teacher-only endpoints. */
export function teacherHeaders(sessionCode) {
  const t = getTeacherToken(sessionCode);
  return t ? { "x-teacher-token": t } : {};
}
