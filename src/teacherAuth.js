// Teacher token handling. The add-on opens the teacher view at
// /teacher/<code>?t=<token>. The token is kept in memory for this page load
// (it survives SPA navigation to the dashboard / inspect sub-routes) and
// persisted for refreshes in sessionStorage and window.name, then taken off
// the address bar. It is attached as the x-teacher-token header on
// teacher-only requests. Students never receive this token.
//
// sessionStorage alone is not enough: it throws on browsers with cookies or
// site data blocked (managed school Chromebooks, strict privacy settings), and
// when it did, every teacher request went out unauthenticated and the whole
// teacher view silently stopped working. window.name is per-tab, survives a
// reload, never shows in the address bar or history, works with storage
// blocked, and browsers reset it on cross-site navigation.

const key = (sessionCode) => `ck-teacher-${sessionCode}`;
const NAME_PREFIX = "ck-teacher:";
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
    if (token) sessionStorage.setItem(key(sessionCode), token);
    else sessionStorage.removeItem(key(sessionCode));
  } catch {}
}

function readNameMap() {
  try {
    if (window.name.startsWith(NAME_PREFIX)) return JSON.parse(window.name.slice(NAME_PREFIX.length)) || {};
  } catch {}
  return {};
}

function writeName(sessionCode, token) {
  const map = readNameMap();
  if (token) map[sessionCode] = token;
  else delete map[sessionCode];
  window.name = Object.keys(map).length ? NAME_PREFIX + JSON.stringify(map) : "";
}

/** Read ?t= from the current URL (if present), persist it, and take it off the address bar. */
export function captureTeacherToken(sessionCode) {
  if (!sessionCode) return;
  const params = new URLSearchParams(window.location.search);
  const t = params.get("t");
  if (!t) return;
  memory.set(sessionCode, t);
  writeStorage(sessionCode, t);
  writeName(sessionCode, t);
  // Never leave the token on a projected address bar / in history.
  params.delete("t");
  const qs = params.toString();
  // Keep history.state: React Router stores its navigation index there.
  window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
}

export function getTeacherToken(sessionCode) {
  if (!sessionCode) return "";
  if (!memory.has(sessionCode)) {
    const stored = readStorage(sessionCode) || readNameMap()[sessionCode] || "";
    if (stored) memory.set(sessionCode, stored);
    else captureTeacherToken(sessionCode);
  }
  return memory.get(sessionCode) || "";
}

// Sessions this tab is ending. Teacher polls skip them, since a poll landing
// between the backend ending the session and the redirect would 403 (and the
// dashboard would flash "not authorized").
const ending = new Set();
export function markEnding(sessionCode, on = true) {
  if (on) ending.add(sessionCode);
  else ending.delete(sessionCode);
}
export function isEnding(sessionCode) {
  return ending.has(sessionCode);
}

/** Forget the token once the session has ended. */
export function clearTeacherToken(sessionCode) {
  memory.delete(sessionCode);
  writeStorage(sessionCode, "");
  writeName(sessionCode, "");
}

/** Headers to spread into a fetch for teacher-only endpoints. */
export function teacherHeaders(sessionCode) {
  const t = getTeacherToken(sessionCode);
  return t ? { "x-teacher-token": t } : {};
}
