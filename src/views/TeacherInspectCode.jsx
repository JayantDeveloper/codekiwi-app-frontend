import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import EditorPane from "../components/EditorPane";
import "xterm/css/xterm.css";
import "./TeacherInspectCode.css";
import NavigationBar from "../components/NavigationBar";
import NotesSidebar from "../components/NotesSidebar";
import { BACKEND_BASE_URL } from "../config";
import { useSessionWebSocket } from "../hooks/useSessionWebSocket";
import { useLockEditor } from "../hooks/useLockEditor";
import { teacherHeaders } from "../teacherAuth";

function getOutputStatus(output) {
  if (!output || output.trim() === "" || output === "No terminal output yet.") return null;
  const lower = output.toLowerCase();
  if (lower.includes("error") || lower.includes("traceback") || lower.includes("exception")) return "error";
  return "success";
}

export default function TeacherInspectCode() {
  const { sessionCode, studentId } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [language, setLanguage] = useState("python");
  const [notes, setNotes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [students, setStudents] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editCode, setEditCode] = useState("");
  const terminalRef = useRef(null);
  const termInstance = useRef(null);
  const lastOutputRef = useRef("");

  const { editorsLocked, setEditorsLocked, toggleLock } = useLockEditor(sessionCode);

  useSessionWebSocket(sessionCode, (data) => {
    if (data.type === "sync") setCurrentIndex(data.slide);
    if (data.type === "lock-editors" && data.sessionCode === sessionCode) {
      setEditorsLocked(!!data.locked);
    }
  });

  useEffect(() => {
    if (!sessionCode) return;
    fetch(`${BACKEND_BASE_URL}/slides/${sessionCode}/notes.json`)
      .then((res) => res.json())
      .then(setNotes)
      .catch(() => {});
    fetch(`${BACKEND_BASE_URL}/slides/${sessionCode}/meta.json`)
      .then((res) => res.json())
      .then((data) => { if (data.language) setLanguage(data.language); })
      .catch(() => {});
  }, [sessionCode]);

  // Keep students list fresh for prev/next/dropdown
  useEffect(() => {
    if (!sessionCode) return;
    const poll = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/students`, {
          headers: teacherHeaders(sessionCode),
        });
        const data = await res.json();
        setStudents(data.students || []);
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [sessionCode]);

  // Reset display when switching students
  useEffect(() => {
    setCode("");
    setOutput("");
    setEditing(false);
    setEditCode("");
    lastOutputRef.current = "";
    if (termInstance.current) termInstance.current.reset();
  }, [studentId]);

  // Tell the student's editor when the teacher is editing their code.
  // Cleanup covers Save, Cancel, switching students, and leaving the page.
  useEffect(() => {
    if (!editing) return;
    const notify = (isEditing) =>
      fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/students/${studentId}/editing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...teacherHeaders(sessionCode) },
        body: JSON.stringify({ editing: isEditing }),
        keepalive: true,
      }).catch(() => {});
    notify(true);
    return () => notify(false);
  }, [editing, sessionCode, studentId]);

  const saveEdit = async () => {
    await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/students/${studentId}/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...teacherHeaders(sessionCode) },
      body: JSON.stringify({ code: editCode }),
    });
    setCode(editCode);
    setEditing(false);
  };

  useEffect(() => {
    if (!terminalRef.current || termInstance.current) return;
    const term = new Terminal({
      disableStdin: true,
      fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.6,
      cursorStyle: "bar",
      cursorBlink: false,
      convertEol: true,
      theme: {
        background: "#111a08",
        foreground: "#b0cc90",
        cursor: "transparent",
        green: "#a8d05f",
        brightGreen: "#c8e89a",
        red: "#f87171",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    termInstance.current = term;
    return () => { term.dispose(); termInstance.current = null; };
  }, []);

  useEffect(() => {
    if (!sessionCode || !studentId || editing) return;
    const fetchData = async () => {
      try {
        const res = await fetch(
          `${BACKEND_BASE_URL}/api/sessions/${sessionCode}/students/${studentId}`,
          { headers: teacherHeaders(sessionCode) }
        );
        const data = await res.json();
        setCode(data.code || "");
        const newOutput = data.output || "";
        setOutput(newOutput);

        const displayed = newOutput || "No terminal output yet.";
        if (termInstance.current && displayed !== lastOutputRef.current) {
          lastOutputRef.current = displayed;
          termInstance.current.reset();
          displayed.split("\n").forEach((line, i, arr) => {
            const isLast = i === arr.length - 1;
            if (isLast && line.trim() === "✔ Done") {
              termInstance.current.write("\x1b[32m✔ Done\x1b[0m\r\n");
            } else {
              termInstance.current.write(line + "\r\n");
            }
          });
        }
      } catch (err) {
        console.error("Failed to fetch student data:", err);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [sessionCode, studentId, editing]);

  const currentStudentIdx = students.findIndex((s) => s.id === studentId);
  const prevStudent = currentStudentIdx > 0 ? students[currentStudentIdx - 1] : null;
  const nextStudent = currentStudentIdx < students.length - 1 ? students[currentStudentIdx + 1] : null;

  const goTo = (id) => navigate(`/teacher/student/${sessionCode}/${id}`);

  const outputStatus = getOutputStatus(output);
  const currentNote = notes[currentIndex];
  const filename = language === "javascript" ? "main.js" : "main.py";
  const langLabel = language === "javascript" ? "JavaScript" : "Python";
  const isCodingSlide = currentNote && currentNote.trimStart().toLowerCase().startsWith("code question");

  return (
    <div className="teacher-container">
      <div className="slide-area">

        {/* ── Inspect header bar ── */}
        <div className="inspect-header-bar">
          <div className="inspect-nav-group">
            <button
              className="inspect-nav-btn"
              onClick={() => prevStudent && goTo(prevStudent.id)}
              disabled={!prevStudent}
              title={prevStudent ? `← ${prevStudent.name}` : "No previous student"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <select
              className="inspect-student-select"
              value={studentId}
              onChange={(e) => goTo(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <button
              className="inspect-nav-btn"
              onClick={() => nextStudent && goTo(nextStudent.id)}
              disabled={!nextStudent}
              title={nextStudent ? `${nextStudent.name} →` : "No next student"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            <span className="inspect-student-pos">
              {currentStudentIdx >= 0 ? `${currentStudentIdx + 1} / ${students.length}` : "—"}
            </span>
          </div>

          {outputStatus && (
            <span className={`inspect-status-badge inspect-status-badge--${outputStatus}`}>
              {outputStatus === "success" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              {outputStatus === "success" ? "Ran successfully" : "Error in output"}
            </span>
          )}
        </div>

        {/* ── Question context strip ── */}
        {isCodingSlide && (
          <div className="inspect-question-strip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="inspect-question-label">Slide {currentIndex + 1}:</span>
            <span className="inspect-question-text">{currentNote.replace(/^code question:\s*/i, "")}</span>
          </div>
        )}

        {/* ── Editor + Terminal ── */}
        <div className="teacher-editor-terminal">
          <div className="teacher-editor-container">
            <div className="editor-header">
              <span className="editor-filename">{filename}</span>
              <div className="editor-header-right">
                <span className="lang-badge">{langLabel}</span>
                {editing ? (
                  <>
                    <button className="inspect-edit-btn inspect-edit-btn--save" onClick={saveEdit}>
                      Save
                    </button>
                    <button className="inspect-edit-btn inspect-edit-btn--cancel" onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="inspect-edit-btn inspect-edit-btn--pencil"
                    title="Edit student code"
                    onClick={() => { setEditCode(code); setEditing(true); }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <EditorPane
              value={editing ? editCode : code}
              onCodeChange={editing ? setEditCode : undefined}
              readOnly={!editing}
              language={language}
            />
          </div>
          <div className="teacher-terminal-wrapper">
            <div className="terminal-header">
              <svg className="terminal-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="4" />
                <polyline points="8 9 13 12 8 15" />
                <line x1="13" y1="15" x2="18" y2="15" />
              </svg>
              <span className="terminal-header-label">Output</span>
            </div>
            <div className="teacher-terminal-pane" ref={terminalRef} />
          </div>
        </div>

        <NavigationBar
          sessionCode={sessionCode}
          editorsLocked={editorsLocked}
          onToggleLock={toggleLock}
          leftButtons={[
            <button
              key="presentation"
              onClick={() => navigate(`/teacher/${sessionCode}?live=true`)}
              className="nav-btn nav-btn--ghost"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Presentation
            </button>,
            <button
              key="dashboard"
              onClick={() => navigate(`/teacher/dashboard/${sessionCode}`)}
              className="nav-btn nav-btn--ghost"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
              Dashboard
            </button>,
          ]}
        />
      </div>
      <NotesSidebar currentIndex={currentIndex} notes={notes} />
    </div>
  );
}
