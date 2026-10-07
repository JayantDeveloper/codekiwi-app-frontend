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

// With storage blocked, the URL is the only thing that survives a refresh, so
// the token has to stay on it across every teacher route.
let storageWorks = null;

function setUrlToken(token) {
  const params = new URLSearchParams(window.location.search);
  if ((params.get("t") || "") === (token || "")) return;
  if (token) params.set("t", token);
  else params.delete("t");
  const qs = params.toString();
  // Keep history.state: React Router stores its navigation index there.
  window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
}

/** Read ?t= from the current URL (if present) and hold it for this session. */
export function captureTeacherToken(sessionCode) {
  if (!sessionCode) return;
  const t = new URLSearchParams(window.location.search).get("t");
  if (!t) return;
  memory.set(sessionCode, t);
  storageWorks = writeStorage(sessionCode, t);
  // Only take the token off the address bar (so it isn't projected or kept in
  // history) once a refresh can still find it. Otherwise leave it in the URL:
  // a visible token beats a teacher view that breaks on reload.
  if (storageWorks) setUrlToken("");
}

export function getTeacherToken(sessionCode) {
  if (!sessionCode) return "";
  if (!memory.has(sessionCode)) {
    const stored = readStorage(sessionCode);
    if (stored) memory.set(sessionCode, stored);
    else captureTeacherToken(sessionCode);
  }
  const token = memory.get(sessionCode) || "";
  // In-app navigation drops the query string; put the token back so a refresh
  // of the dashboard or inspect page still works without storage.
  if (token && storageWorks === false && window.location.pathname.startsWith("/teacher/")) setUrlToken(token);
  return token;
}

/** Headers to spread into a fetch for teacher-only endpoints. */
export function teacherHeaders(sessionCode) {
  const t = getTeacherToken(sessionCode);
  return t ? { "x-teacher-token": t } : {};
}
