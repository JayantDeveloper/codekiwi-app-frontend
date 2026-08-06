import React, { useCallback, useState } from "react";
import "./Slides.css";
import { BACKEND_BASE_URL } from "../config";

function Slides({ isTeacher, slides = [], currentIndex = 0, sessionCode, loading = false, error = null, onSessionIdClick }) {
  const [aspectRatio, setAspectRatio] = useState(null);

  const handleImageLoad = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight && !aspectRatio) {
      setAspectRatio(`${naturalWidth} / ${naturalHeight}`);
    }
  }, [aspectRatio]);

  if (loading) return <div className="slides-container">Loading slides...</div>;
  if (error) return <div className="slides-container">Error: {error}</div>;
  if (slides.length === 0) return <div className="slides-container">No slides found</div>;

  const src = `${BACKEND_BASE_URL}${slides[currentIndex]}`;

  return (
    <div className="slides-container">
      {onSessionIdClick ? (
        <button
          className="session-id session-id--clickable"
          onClick={onSessionIdClick}
          title="Show join info, QR code & connected students"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="16" y="16" width="5" height="5" rx="1" />
          </svg>
          Session: {sessionCode}
        </button>
      ) : (
        <h2 className="session-id">Session: {sessionCode}</h2>
      )}
      <div
        className="slide-frame"
        style={aspectRatio ? { aspectRatio } : undefined}
      >
        <img
          src={src}
          alt={`Slide ${currentIndex + 1}`}
          className="slide-image"
          onLoad={handleImageLoad}
          draggable={false}
        />
      </div>
    </div>
  );
}

export default Slides;
