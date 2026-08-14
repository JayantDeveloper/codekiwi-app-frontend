import React, { useEffect, useRef, useState } from "react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import { vs2015 } from "react-syntax-highlighter/dist/esm/styles/hljs";
import "./TeacherDashboardView.css";
import NavigationBar from "../components/NavigationBar";
import NotesSidebar from "../components/NotesSidebar";
import { useParams, useNavigate } from "react-router-dom";
import { BACKEND_BASE_URL } from "../config";
import { useSessionWebSocket } from "../hooks/useSessionWebSocket";
import { useLockEditor } from "../hooks/useLockEditor";
import { captureTeacherToken, teacherHeaders } from "../teacherAuth";
import {
  getStatus,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_FILTERS,
  passedCount,
  countCodingSlides,
} from "../studentStatus";

SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("javascript", javascript);

function timeAgo(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export default function TeacherDashboardView() {
  const { sessionCode } = useParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState({});
  const [language, setLanguage] = useState("python");
  const [, setTick] = useState(0);
  const lastSeenCodeRef = useRef({});
  const [filter, setFilter] = useState("all"); // all | error | empty | coding | ran
  const [sort, setSort] = useState("status");  // status | updated | name

  const { editorsLocked, setEditorsLocked, toggleLock } = useLockEditor(sessionCode);

  useSessionWebSocket(sessionCode, (data) => {
    if (data.type === "sync") setCurrentIndex(data.slide);
    if (data.type === "lock-editors" && data.sessionCode === sessionCode) {
      setEditorsLocked(!!data.locked);
    }
  });

  // Re-render every second so relative timestamps stay fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    if (!sessionCode) return;
    captureTeacherToken(sessionCode);
    const fetchStudents = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/students`, {
          headers: teacherHeaders(sessionCode),
        });
        const data = await res.json();
        const incoming = data.students || [];

        const updates = {};
        incoming.forEach((s) => {
          if (lastSeenCodeRef.current[s.id] !== s.code) {
            lastSeenCodeRef.current[s.id] = s.code;
            updates[s.id] = Date.now();
          }
        });
        if (Object.keys(updates).length > 0) {
          setLastUpdated((prev) => ({ ...prev, ...updates }));
        }
        setStudents(incoming);
      } catch (err) {
        console.error("Error fetching student data:", err);
      }
    };
    fetchStudents();
    const interval = setInterval(fetchStudents, 3000);
    return () => clearInterval(interval);
  }, [sessionCode]);

  const totalCoding = countCodingSlides(notes);

  return (
    <div className="tdb-container">
      <div className="tdb-body">
        <div className="tdb-main">
          <div className="tdb-header-row">
            <h2 className="tdb-title">Student Code Dashboard</h2>
            {students.length > 0 && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                {/* Filter tabs */}
                <div style={{ display: "flex", gap: "4px", background: "#e8f4d4", borderRadius: "8px", padding: "3px" }}>
                  {STATUS_FILTERS.map(([val, label]) => {
                    const activeBg = val === "help" ? "#dc2626" : val === "error" ? "#d97706" : val === "done" ? "#16a34a" : "#6b8f2b";
                    return (
                      <button
                        key={val}
                        onClick={() => setFilter(val)}
                        style={{
                          padding: "3px 10px", borderRadius: "6px", border: "none", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                          background: filter === val ? activeBg : "transparent",
                          color: filter === val ? "#fff" : "#6b8f2b",
                        }}
                      >
                        {label}
                        {val !== "all" && (
                          <span style={{ marginLeft: "4px", opacity: 0.8 }}>
                            ({students.filter(s => getStatus(s) === val).length})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Sort select */}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: "7px", border: "1.5px solid #a8d05f", background: "#fff", fontSize: "0.75rem", color: "#6b8f2b", fontWeight: 600, cursor: "pointer" }}
                >
                  <option value="status">Sort: Needs help first</option>
                  <option value="updated">Sort: Last updated</option>
                  <option value="name">Sort: Name</option>
                </select>
              </div>
            )}
          </div>

          {students.length === 0 ? (
            <div className="tdb-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p>Waiting for students to join and submit code…</p>
            </div>
          ) : (
            <div className="tdb-grid">
              {[...students]
                .filter(s => filter === "all" || getStatus(s) === filter)
                .sort((a, b) => {
                  if (sort === "status") return STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)];
                  if (sort === "updated") return (lastUpdated[b.id] || 0) - (lastUpdated[a.id] || 0);
                  return a.name.localeCompare(b.name);
                })
                .map((student) => {
                const status = getStatus(student);
                const ts = timeAgo(lastUpdated[student.id]);
                const solved = passedCount(student);
                return (
                  <div
                    key={student.id}
                    className={`student-card student-card--${status}`}
                    style={student.color ? { background: student.color, borderColor: student.color } : {}}
                    onClick={() => navigate(`/teacher/student/${sessionCode}/${student.id}`)}
                  >
                    <div className="card-header">
                      <div className="card-name-row">
                        <span className={`status-dot status-dot--${status}`} />
                        <span className="card-name" style={student.color ? { color: "white" } : {}}>
                          {student.name}
                        </span>
                        {ts && <span className="card-timestamp" style={student.color ? { color: "rgba(255,255,255,0.75)" } : {}}>
                          {ts}
                        </span>}
                      </div>
                      <div className="card-status-group">
                        {totalCoding > 0 && (
                          <span
                            className="card-score"
                            style={student.color ? { background: "rgba(0,0,0,0.22)", color: "#fff", borderColor: "transparent" } : {}}
                            title="Coding questions answered correctly"
                          >
                            {solved}/{totalCoding}
                          </span>
                        )}
                        <span className={`status-pill status-pill--on-${status}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </div>
                    </div>
                    <div className="card-code-block">
                      <SyntaxHighlighter
                        language={language}
                        style={vs2015}
                        customStyle={{
                          margin: 0,
                          padding: 0,
                          background: "transparent",
                          fontSize: "0.72rem",
                          lineHeight: "1.55",
                          height: "100px",
                          overflowY: "auto",
                          overflowX: "hidden",
                        }}
                        codeTagProps={{ style: { fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace" } }}
                      >
                        {student.code?.slice(0, 220) || "# No code yet"}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {students.length > 0 && filter !== "all" && students.filter(s => getStatus(s) === filter).length === 0 && (
            <div className="tdb-empty" style={{ paddingTop: "40px" }}>
              <p style={{ color: "#6b8f2b", opacity: 0.6, fontSize: "0.9rem" }}>No students match this filter.</p>
            </div>
          )}
        </div>
        <NotesSidebar currentIndex={currentIndex} notes={notes} />
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
        ]}
      />
    </div>
  );
}
