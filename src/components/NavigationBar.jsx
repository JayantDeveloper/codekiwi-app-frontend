import React, { useState, useEffect } from "react";
import "../views/TeacherView.css";
import { BACKEND_BASE_URL } from "../config";

export default function NavigationBar({ leftButtons, sessionCode, editorsLocked, onToggleLock, slideInfo }) {
  const [studentCount, setStudentCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const fetchStudentCount = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/students`);
        const data = await res.json();
        setStudentCount(data.students?.length || 0);
      } catch (err) {
        console.error("Failed to fetch student count:", err);
      }
    };
    fetchStudentCount();
    const interval = setInterval(fetchStudentCount, 3000);
    return () => clearInterval(interval);
  }, [sessionCode]);

  const handleEndSession = async () => {
    setShowConfirm(false);
    try {
      const resp = await fetch(
        `${BACKEND_BASE_URL}/api/sessions/${sessionCode}/end`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      if (!resp.ok) throw new Error("Failed to end session");

      const wsUrl = BACKEND_BASE_URL.replace(/^http/, "ws");
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "session-ended", sessionCode }));
        ws.close();
      };

      window.location.href = "https://www.codekiwi.tech/home";
    } catch (e) {
      console.error(e);
      alert("Could not end session. Please try again.");
    }
  };

  return (
    <>
    {showConfirm && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 28px", maxWidth: "360px", width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", textAlign: "center" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <p style={{ fontWeight: 700, fontSize: "1rem", color: "#1a1a1a", marginBottom: "8px" }}>End this session?</p>
          <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "24px" }}>
            All students will be disconnected. This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button onClick={() => setShowConfirm(false)} style={{ padding: "8px 20px", borderRadius: "8px", border: "1px solid #e5e7eb", background: "#fff", fontSize: "0.875rem", cursor: "pointer", color: "#374151" }}>
              Cancel
            </button>
            <button onClick={handleEndSession} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#dc2626", color: "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
              End Session
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="slide-controls">
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <img src="/codekiwilogo.png" alt="CodeKiwi" style={{ height: "28px", width: "28px", objectFit: "contain", flexShrink: 0, marginRight: "4px" }} />

        {leftButtons}

        <a
          href={`/student/${sessionCode}`}
          target="_blank"
          rel="noopener noreferrer"
          className="nav-btn nav-btn--outline-blue"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Student View
        </a>

        <button onClick={onToggleLock} className={`nav-btn ${editorsLocked ? "nav-btn--lock-on" : "nav-btn--lock-off"}`}>
          {editorsLocked ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
          {editorsLocked ? "Unlock Editors" : "Lock Editors"}
        </button>

        <div className="student-count">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {studentCount} {studentCount === 1 ? "student" : "students"}
        </div>

        {slideInfo && (
          <div className="student-count">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            {slideInfo.current + 1} / {slideInfo.total}
          </div>
        )}
      </div>

      <button className="nav-btn nav-btn--danger" onClick={() => setShowConfirm(true)}>
        End Session
      </button>
    </div>
    </>
  );
}
