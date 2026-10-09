import React, { useState } from "react";
import "./NotesSidebar.css";

// Collapsible speaker notes. A view can control it (`collapsed` + `onToggle`);
// a view that doesn't gets its own state, starting collapsed.
export default function NotesSidebar({ currentIndex, notes, collapsed: collapsedProp, onToggle: onToggleProp }) {
  const [collapsedState, setCollapsedState] = useState(true);
  const controlled = collapsedProp !== undefined;
  const collapsed = controlled ? collapsedProp : collapsedState;
  const onToggle = controlled ? onToggleProp : () => setCollapsedState((c) => !c);

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
