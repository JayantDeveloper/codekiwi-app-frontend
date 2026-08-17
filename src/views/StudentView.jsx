import React, { useEffect, useState, useRef, useContext } from "react";
import Slides from "../components/Slides";
import EditorPane from "../components/EditorPane";
import RunButton from "../components/RunButton";
import TerminalPane from "../components/TerminalPane";
import "./StudentView.css";
import { useParams } from "react-router-dom";
import { BACKEND_BASE_URL } from "../config";
import { TerminalContext } from "../context";

const STARTER_CODE = {
  python: `# Write your code here\nprint("Hello, World!")\n`,
  javascript: `// Write your code here\nconsole.log("Hello, World!");\n`,
};

export default function StudentView() {
  const { sessionCode, studentId } = useParams();
  const [studentName] = useState(() => localStorage.getItem("studentName") || "Unnamed Student");

  const [slides, setSlides] = useState([]);
  const [slidesLoading, setSlidesLoading] = useState(true);
  const [slidesError, setSlidesError] = useState(null);

  const [language, setLanguage] = useState("python");
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
  const storageKey = `codekiwi-code-${sessionCode}-${studentId}`;
  const [codeBySlide] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch {
      return {};
    }
  });
  const [codingSlides, setCodingSlides] = useState([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [pendingSlideIndex, setPendingSlideIndex] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  const wsRef = useRef(null);
  const { terminal } = useContext(TerminalContext);

  useEffect(() => {
    fetch(`${BACKEND_BASE_URL}/slides/${sessionCode}/index.json`)
      .then((res) => res.json())
      .then((data) => { setSlides(data.slides || []); setSlidesLoading(false); })
      .catch(() => { setSlidesError("Failed to load slides"); setSlidesLoading(false); });
  }, [sessionCode]);

  useEffect(() => {
    fetch(`${BACKEND_BASE_URL}/slides/${sessionCode}/meta.json`)
      .then((res) => res.json())
      .then((data) => { if (data.language) setLanguage(data.language); })
      .catch(() => {});
  }, [sessionCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/exists`);
        const { exists, active } = await r.json();
        if (!cancelled) setSessionEnded(!exists || !active);
      } catch (e) {
        console.error("exists check failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionCode]);

  useEffect(() => {
    fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/coding-slides`)
      .then((res) => res.json())
      .then(({ codingSlides }) => setCodingSlides(codingSlides))
      .catch((err) => console.error("Failed to load coding slide info:", err));
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

  useEffect(() => {
    if (sessionEnded) return;
    const wsUrl = BACKEND_BASE_URL.replace(/^http/, "ws");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "join", sessionCode, studentId }));
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
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
      if (data.type === "session-ended" && data.sessionCode === sessionCode) {
        setSessionEnded(true);
        try { ws.close(); } catch {}
      }
    };
    ws.onerror = (e) => console.error("WS error", e);
    return () => { try { ws.close(); } catch {} };
  }, [sessionCode, sessionEnded, studentId]);

  // Keep each coding slide's work saved as the student types (or when the
  // teacher overrides), so navigating away and back restores it. Saving is
  // held off until the first restore below has run, so the empty initial
  // buffer never overwrites work saved from a previous page load.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!restoredRef.current || !codingSlides.includes(currentSlideIndex)) return;
    codeBySlide[currentSlideIndex] = editorContent;
    try { localStorage.setItem(storageKey, JSON.stringify(codeBySlide)); } catch {}
  }, [editorContent, currentSlideIndex, codingSlides, codeBySlide, storageKey]);

  useEffect(() => {
    if (sessionEnded || pendingSlideIndex === null || codingSlides.length === 0) return;
    restoredRef.current = true;
    setCurrentSlideIndex(pendingSlideIndex);
    if (codingSlides.includes(pendingSlideIndex)) {
      const saved = codeBySlide[pendingSlideIndex];
      setEditorContent(saved ? saved : (STARTER_CODE[language] || STARTER_CODE.python));
    } else {
      setEditorContent("");
    }
    setOutput("");
    if (terminal) terminal.reset();
  }, [pendingSlideIndex, codingSlides, sessionEnded, language, terminal, codeBySlide]);

  useEffect(() => {
    if (!sessionEnded) return;
    try { localStorage.removeItem(storageKey); } catch {}
  }, [sessionEnded, storageKey]);

  useEffect(() => {
    if (sessionEnded) return;
    const interval = setInterval(() => {
      fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, name: studentName, code: editorContent || "", output: output || "", handRaised, slideIndex: currentSlideIndex }),
      }).catch((err) => console.error("Failed to post code:", err));
    }, 3000);
    return () => clearInterval(interval);
  }, [sessionCode, studentId, studentName, editorContent, output, handRaised, currentSlideIndex, sessionEnded]);

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

  const isCodeSlide = codingSlides.length > 0 && codingSlides.includes(currentSlideIndex);
  const showRight = isCodeSlide || demoWatch;
  const filename = language === "javascript" ? "main.js" : "main.py";
  const langLabel = language === "javascript" ? "JavaScript" : "Python";

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
    <div className="student-container">
      <div className={`student-left ${!showRight ? "full-width" : ""}`}>
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
        <div className="student-right">
          {demoWatch ? (
            <>
              <div className="editor-section">
                <div className="editor-header">
                  <span className="editor-filename">{filename}</span>
                  <span className="demo-watch-badge">
                    <span className="demo-watch-dot" />
                    Watching teacher
                  </span>
                </div>
                <EditorPane value={demoCode} readOnly language={language} />
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
                <pre className="demo-watch-term">{demoOutput || "▶ waiting for the teacher to run…"}</pre>
              </div>
            </>
          ) : (
          <>
          <div className="editor-section">
            <div className="editor-header">
              <span className="editor-filename">{filename}</span>
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
