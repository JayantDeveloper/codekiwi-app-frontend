import React, { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Slides from "../components/Slides";
import NavigationBar from "../components/NavigationBar";
import NotesSidebar from "../components/NotesSidebar";
import "./TeacherView.css";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { BACKEND_BASE_URL } from "../config";
import { useSessionWebSocket } from "../hooks/useSessionWebSocket";
import { useLockEditor } from "../hooks/useLockEditor";
import { captureTeacherToken, teacherHeaders } from "../teacherAuth";

const JOIN_BASE = "https://www.codekiwi.app/student";

export default function TeacherView() {
  const { sessionCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [slides, setSlides] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState([]);

  const [showModal, setShowModal] = useState(
    () => !new URLSearchParams(location.search).has("live")
  );
  const [hasStarted, setHasStarted] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [studentNames, setStudentNames] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const toastTimerRef = useRef(null);

  const { editorsLocked, setEditorsLocked, toggleLock } = useLockEditor(sessionCode);
  const wsRef = useSessionWebSocket(sessionCode, (data) => {
    if (data.type === "sync") setCurrentIndex(data.slide);
    if (data.type === "lock-editors" && data.sessionCode === sessionCode) {
      setEditorsLocked(!!data.locked);
    }
  });

  // Persist the teacher token from the ?t= param the add-on opened us with,
  // before any teacher-only request fires. Must run before the student poll.
  useEffect(() => {
    captureTeacherToken(sessionCode);
  }, [sessionCode]);

  useEffect(() => {
    if (!sessionCode) return;
    fetch(`${BACKEND_BASE_URL}/slides/${sessionCode}/index.json`)
      .then((res) => res.json())
      .then((data) => { setSlides(data.slides || []); setLoading(false); })
      .catch(() => { setError("Failed to load slides"); setLoading(false); });

    fetch(`${BACKEND_BASE_URL}/slides/${sessionCode}/notes.json`)
      .then((res) => res.json())
      .then(setNotes)
      .catch((err) => console.warn("No notes found:", err));
  }, [sessionCode]);

  useEffect(() => {
    if (!sessionCode) return;
    const poll = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/students`, {
          headers: teacherHeaders(sessionCode),
        });
        const data = await res.json();
        const students = data.students || [];
        setStudentCount(students.length);
        setStudentNames(students.map((s) => s.name));
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [sessionCode]);

  const copyLink = () => {
    const url = `${JOIN_BASE}/${sessionCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  // Dismissing the lobby (via Start Class or the ✕) marks the class as begun,
  // so any later reopen shows "Continue Class" instead of "Start Class".
  const closeLobby = () => {
    setHasStarted(true);
    setShowModal(false);
  };

  const changeSlide = (newIndex) => {
    if (newIndex < 0 || newIndex >= slides.length) return;
    setCurrentIndex(newIndex);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "change", slide: newIndex, sessionCode }));
    }
  };

  return (
    <div className="teacher-container">
      {/* ── Modal overlay ── */}
      {showModal && (
        <div className="lobby-overlay">
          <div className="lobby-card">
            <button className="lobby-close-btn" onClick={closeLobby} title="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Two-column layout: code info + QR */}
            <div style={{ display: "flex", gap: "20px", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ flex: 1 }}>
                <div className="lobby-url-box">codekiwi.app</div>
                <div className="lobby-code-box" style={{ marginBottom: 0 }}>
                  <p className="lobby-code-label">Session Code</p>
                  <p className="lobby-code">{sessionCode}</p>
                  <div className="lobby-waiting">
                    <span className="lobby-spinner" />
                    Waiting for students…
                  </div>
                </div>
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <QRCodeSVG
                  value={`${JOIN_BASE}/${sessionCode}`}
                  size={110}
                  bgColor="#ffffff"
                  fgColor="#3d5a13"
                  level="M"
                />
                <span style={{ fontSize: "0.7rem", color: "#6b8f2b", opacity: 0.7 }}>Scan to join</span>
              </div>
            </div>

            {/* Student name list */}
            {studentNames.length > 0 && (
              <div style={{ background: "#f0f7e6", borderRadius: "10px", padding: "10px 12px", marginBottom: "12px", maxHeight: "90px", overflowY: "auto" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {studentNames.map((name, i) => (
                    <span key={i} style={{ background: "#a8d05f33", color: "#3d5a13", borderRadius: "20px", padding: "2px 10px", fontSize: "0.78rem", fontWeight: 500 }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="lobby-footer-row">
              <div className="lobby-student-count">
                <span className={`lobby-dot ${studentCount > 0 ? "lobby-dot--active" : ""}`} />
                {studentCount === 0
                  ? "No students connected"
                  : `${studentCount} student${studentCount === 1 ? "" : "s"} connected`}
              </div>
              <button className="lobby-copy-btn" onClick={copyLink}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Give Students a Link
              </button>
            </div>

            <button className="lobby-start-btn" onClick={closeLobby}>
              {hasStarted ? "Continue Class" : "Start Class"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginLeft: "6px" }}>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Slide area ── */}
      <div className="slide-area">
        <div className="slide-box">
          {loading ? (
            <div className="teacher-loading-inline">Loading slides…</div>
          ) : error ? (
            <div className="teacher-loading-inline">{error}</div>
          ) : (
            <Slides
              sessionCode={sessionCode}
              slides={slides}
              currentIndex={currentIndex}
              isTeacher
              onSessionIdClick={() => setShowModal(true)}
            />
          )}
        </div>
        <NavigationBar
          sessionCode={sessionCode}
          editorsLocked={editorsLocked}
          onToggleLock={toggleLock}
          leftButtons={[
            <button
              key="prev"
              className="nav-btn nav-btn--ghost nav-btn--icon"
              onClick={() => changeSlide(currentIndex - 1)}
              disabled={currentIndex === 0}
              aria-label="Previous slide"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>,
            slides.length > 0 && (
              <div key="counter" className="student-count slide-counter-inline">
                {currentIndex + 1} <span className="slide-counter-inline-sep">/</span> {slides.length}
              </div>
            ),
            <button
              key="next"
              className="nav-btn nav-btn--ghost nav-btn--icon"
              onClick={() => changeSlide(currentIndex + 1)}
              disabled={currentIndex === slides.length - 1}
              aria-label="Next slide"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>,
            <button
              key="dashboard"
              onClick={() => navigate(`/teacher/dashboard/${sessionCode}`)}
              className="nav-btn nav-btn--primary"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              Dashboard
            </button>,
          ]}
        />
      </div>
      <NotesSidebar currentIndex={currentIndex} notes={notes} />

      {/* Toast */}
      <div className={`lobby-toast ${linkCopied ? "lobby-toast--visible" : ""}`}>
        Link copied to your clipboard&nbsp;
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle" }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </div>
  );
}
