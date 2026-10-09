import React, { useEffect, useState, useRef, useContext } from "react";
import Slides from "../components/Slides";
import EditorPane from "../components/EditorPane";
import RunButton from "../components/RunButton";
import TerminalPane from "../components/TerminalPane";
import "./StudentView.css";
import { useParams, useNavigate } from "react-router-dom";
import { BACKEND_BASE_URL } from "../config";
import { TerminalContext } from "../context";
import { langMeta } from "../lang";
import { useSplitPane } from "../hooks/useSplitPane";
import { useSessionWebSocket } from "../hooks/useSessionWebSocket";

export default function StudentView() {
  const { sessionCode, studentId } = useParams();
  const navigate = useNavigate();
  const [studentName] = useState(() => localStorage.getItem("studentName") || "Unnamed Student");

  const [slides, setSlides] = useState([]);
  const [slidesLoading, setSlidesLoading] = useState(true);
  const [slidesError, setSlidesError] = useState(null);

  const [language, setLanguage] = useState("python");
  // The starter code depends on the language, which arrives separately from
  // the slides. Seeding before it's known gave C++/Java/JS students the Python
  // starter, which was then saved for that slide and never replaced.
  const [languageReady, setLanguageReady] = useState(false);
  const [editorContent, setEditorContent] = useState("");
  const [output, setOutput] = useState("");
  const [editorLocked, setEditorLocked] = useState(false);
  const [teacherEditing, setTeacherEditing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  // Live teacher-demo: when active, the student's editor + terminal mirror the
  // teacher's, read-only. The student's own work (editorContent) is untouched.
  const [demoWatch, setDemoWatch] = useState(false);
  const [demoCode, setDemoCode] = useState("");
  const [demoOutput, setDemoOutput] = useState("");

  // Student work keyed by slide index, backed by localStorage so a page
  // refresh mid-session doesn't lose it. Mutated in place; the editor's
  // `editorContent` state is what drives re-renders.
  // Keyed by session + name (not the seat id) so a rejoin after the server
  // lost the roster, or a re-entered code, gets the same saved work back.
  const storageKey = `codekiwi-code-${sessionCode}-${studentName.trim().toLowerCase()}`;
  const [codeBySlide] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem(storageKey)) ||
        JSON.parse(localStorage.getItem(`codekiwi-code-${sessionCode}-${studentId}`)) || // pre-rename key
        {}
      );
    } catch {
      return {};
    }
  });
  // null until loaded: an empty list is a real answer (lecture-only deck) and
  // must not block slide sync, but "not loaded yet" must.
  const [codingSlides, setCodingSlides] = useState(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [pendingSlideIndex, setPendingSlideIndex] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  const { terminal } = useContext(TerminalContext);
  const keepWorkRef = useRef(false);

  // Draggable slide/editor split. Editor opens at 40% of the row; the student
  // can drag the divider anywhere between 20% and 70%.
  const { editorPct, containerRef, startDrag } = useSplitPane(40, { min: 20, max: 70 });

  useEffect(() => {
    fetch(`${BACKEND_BASE_URL}/slides/${sessionCode}/index.json`)
      .then((res) => res.json())
      .then((data) => { setSlides(data.slides || []); setSlidesLoading(false); })
      .catch(() => { setSlidesError("Failed to load slides"); setSlidesLoading(false); });
  }, [sessionCode]);

  useEffect(() => {
    fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/meta`)
      .then((res) => res.json())
      .then((data) => { if (data.language) setLanguage(data.language); })
      .catch(() => {})
      .finally(() => setLanguageReady(true));
  }, [sessionCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/exists`);
        const { exists, active } = await r.json();
        if (cancelled) return;
        // exists:false means the backend lost the session (restart), not that
        // the teacher ended it: show the ended screen but keep the saved work.
        if (!exists) keepWorkRef.current = true;
        setSessionEnded(!exists || !active);
      } catch (e) {
        console.error("exists check failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionCode]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const load = (attempt) => {
      fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/coding-slides`)
        .then((res) => res.json())
        .then(({ codingSlides }) => { if (!cancelled) setCodingSlides(codingSlides || []); })
        .catch((err) => {
          console.error("Failed to load coding slide info:", err);
          if (!cancelled) timer = setTimeout(() => load(attempt + 1), Math.min(15000, 1000 * 2 ** attempt));
        });
    };
    load(0);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/lock`);
        const { locked } = await res.json();
        if (!cancelled) setEditorLocked(!!locked);
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [sessionCode]);

  const { status: wsStatus } = useSessionWebSocket(
    sessionCode,
    (data) => {
      if (data.type === "lock-editors" && data.sessionCode === sessionCode) setEditorLocked(!!data.locked);
      if (data.type === "sync") setPendingSlideIndex(data.slide);
      if (data.type === "teacher-editing") setTeacherEditing(!!data.editing);
      if (data.type === "code-override") {
        setEditorContent(data.code);
        setTeacherEditing(false);
      }
      if (data.type === "demo-start") {
        setDemoCode(data.code || "");
        setDemoOutput(data.output || "");
        setDemoWatch(true);
      }
      if (data.type === "demo-code") setDemoCode(data.code || "");
      if (data.type === "demo-run") setDemoOutput(data.output || "");
      if (data.type === "demo-end") setDemoWatch(false);
      if (data.type === "session-ended" && data.sessionCode === sessionCode) setSessionEnded(true);
    },
    { studentId, enabled: !sessionEnded }
  );

  // Keep each coding slide's work saved as the student types (or when the
  // teacher overrides), so navigating away and back restores it. Saving is
  // held off until the first restore below has run, so the empty initial
  // buffer never overwrites work saved from a previous page load.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!restoredRef.current || !codingSlides || !codingSlides.includes(currentSlideIndex)) return;
    codeBySlide[currentSlideIndex] = editorContent;
    try { localStorage.setItem(storageKey, JSON.stringify(codeBySlide)); } catch {}
  }, [editorContent, currentSlideIndex, codingSlides, codeBySlide, storageKey]);

  useEffect(() => {
    if (sessionEnded || pendingSlideIndex === null || codingSlides === null || !languageReady) return;
    restoredRef.current = true;
    setCurrentSlideIndex(pendingSlideIndex);
    if (codingSlides.includes(pendingSlideIndex)) {
      const saved = codeBySlide[pendingSlideIndex];
      setEditorContent(saved ? saved : langMeta(language).starter);
    } else {
      setEditorContent("");
    }
    setOutput("");
    if (terminal) terminal.reset();
  }, [pendingSlideIndex, codingSlides, sessionEnded, language, languageReady, terminal, codeBySlide]);

  useEffect(() => {
    if (!sessionEnded || keepWorkRef.current) return;
    try { localStorage.removeItem(storageKey); } catch {}
  }, [sessionEnded, storageKey]);

  // Heartbeat every 3s from a stable interval. The payload is read from a ref
  // so continuous typing does not keep resetting the timer (which used to
  // starve the dashboard and lose the last burst of work at End).
  const heartbeatRef = useRef({});
  heartbeatRef.current = { studentId, name: studentName, code: editorContent || "", output: output || "", handRaised, slideIndex: currentSlideIndex };
  useEffect(() => {
    if (sessionEnded) return;
    const url = `${BACKEND_BASE_URL}/api/sessions/${sessionCode}/code`;
    const post = (keepalive = false) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(heartbeatRef.current),
        keepalive,
      })
        .then((r) => {
          if (r.status === 410) setSessionEnded(true);
          // 403: the server no longer knows this seat (it restarted). Keep the
          // saved work and send the student back to re-enter their name.
          if (r.status === 403) {
            keepWorkRef.current = true;
            navigate(`/student/${sessionCode}`, { replace: true, state: { rejoin: true } });
          }
        })
        .catch((err) => console.error("Failed to post code:", err));
    const interval = setInterval(() => post(), 3000);
    const flush = () => post(true);
    window.addEventListener("pagehide", flush);
    return () => { clearInterval(interval); window.removeEventListener("pagehide", flush); };
  }, [sessionCode, sessionEnded, navigate]);

  // Raise/lower the "I'm stuck" flag and push it immediately so the teacher
  // dashboard reflects it without waiting for the next 3s heartbeat.
  const setHand = (next) => {
    setHandRaised(next);
    fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, name: studentName, code: editorContent || "", output: output || "", handRaised: next, slideIndex: currentSlideIndex }),
    }).catch(() => {});
  };

  const isCodeSlide = !!codingSlides && codingSlides.includes(currentSlideIndex);
  const showRight = isCodeSlide || demoWatch;
  const filename = langMeta(language).file;
  const langLabel = langMeta(language).label;

  if (sessionEnded) {
    return (
      <div className="session-ended-screen">
        <img src="/codekiwilogo.png" alt="CodeKiwi" style={{ width: "80px", height: "80px", objectFit: "contain", marginBottom: "16px" }} />
        <h1>This session has ended.</h1>
        <p>Thanks for coding with us!</p>
      </div>
    );
  }

  return (
    <div className="student-container" ref={containerRef}>
      {wsStatus === "reconnecting" && (
        <div className="ws-banner" role="status">Reconnecting to your teacher…</div>
      )}
      <div
        className={`student-left ${!showRight ? "full-width" : ""}`}
        style={showRight ? { flex: "1 1 0", maxWidth: "none" } : undefined}
      >
        <div className={`slide-wrapper ${!showRight ? "shrink" : ""}`}>
          <Slides
            isTeacher={false}
            sessionCode={sessionCode}
            slides={slides}
            currentIndex={currentSlideIndex}
            loading={slidesLoading}
            error={slidesError}
          />
        </div>
      </div>
      {showRight && (
        <div
          className="split-resizer"
          onMouseDown={startDrag}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
        />
      )}
      {showRight && (
        <div
          className="student-right"
          style={{ flex: `0 0 calc(${editorPct}% - 8px)`, maxWidth: "none" }}
        >
          {demoWatch ? (
            <>
              <div className="watch-banner">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Watching your teacher's live demo. Your own editor is paused.
              </div>
              <div className="editor-section editor-section--watching">
                <div className="editor-header">
                  <span className="editor-filename">{filename}</span>
                  <span className="demo-watch-badge">
                    <span className="demo-watch-dot" />
                    Watching teacher
                  </span>
                </div>
                <EditorPane value={demoCode} readOnly language={language} />
              </div>
              <div className="terminal-section terminal-section--watching">
                <div className="terminal-header">
                  <svg className="terminal-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="4" />
                    <polyline points="8 9 13 12 8 15" />
                    <line x1="13" y1="15" x2="18" y2="15" />
                  </svg>
                  <span className="terminal-header-label">Teacher's Output</span>
                </div>
                <pre className="demo-watch-term">{demoOutput || "▶ waiting for the teacher to run…"}</pre>
              </div>
            </>
          ) : (
          <>
          {editorLocked && (
            <div className="lock-banner" role="status">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Your teacher locked editors. Eyes up front! You can still read your code.
            </div>
          )}
          <div className={`editor-section ${editorLocked ? "editor-section--locked" : ""}`}>
            <div className="editor-header">
              <span className="editor-filename">{filename}</span>
              {editorLocked && (
                <span className="locked-badge">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Locked
                </span>
              )}
              {teacherEditing && (
                <span className="teacher-editing-badge">
                  <span className="teacher-editing-dot" />
                  Teacher is editing…
                </span>
              )}
              <div className="editor-header-right">
                <button
                  type="button"
                  className={`stuck-button ${handRaised ? "stuck-button--active" : ""}`}
                  onClick={() => setHand(!handRaised)}
                  title={handRaised ? "You raised your hand. Click to lower it." : "Let your teacher know you're stuck"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2 2 2 0 0 0-2-2 2 2 0 0 0-2 2v0a2 2 0 0 0-2-2 2 2 0 0 0-2 2v6" />
                    <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
                    <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
                    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                  </svg>
                  {handRaised ? "Hand raised" : "I'm stuck"}
                </button>
                <span className="lang-badge">{langLabel}</span>
                <RunButton
                  code={editorContent}
                  onOutput={setOutput}
                  onGrade={(grade) => { if (grade.graded && grade.passed) setHand(false); }}
                  language={language}
                  sessionCode={sessionCode}
                  studentId={studentId}
                  slideIndex={currentSlideIndex}
                  locked={editorLocked}
                />
              </div>
            </div>
            <EditorPane
              value={editorContent}
              onCodeChange={setEditorContent}
              readOnly={editorLocked}
              language={language}
            />
          </div>
          <div className="terminal-section">
            <div className="terminal-header">
              <svg className="terminal-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="4" />
                <polyline points="8 9 13 12 8 15" />
                <line x1="13" y1="15" x2="18" y2="15" />
              </svg>
              <span className="terminal-header-label">Output</span>
            </div>
            <TerminalPane onOutputChange={setOutput} />
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}
