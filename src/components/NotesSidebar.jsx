import React from "react";
import "./NotesSidebar.css";

export default function NotesSidebar({ currentIndex, notes, collapsed, onToggle }) {
  if (collapsed) {
    return (
      <button className="notes-rail" onClick={onToggle} title="Show speaker notes">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span className="notes-rail-label">Notes</span>
      </button>
    );
  }

  return (
    <div className="notes-sidebar">
      <div className="notes-sidebar-head">
        <h3>Notes</h3>
        <button className="notes-collapse-btn" onClick={onToggle} title="Hide speaker notes">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      <p>{notes?.[currentIndex] || "No notes for this slide."}</p>
    </div>
  );
}
