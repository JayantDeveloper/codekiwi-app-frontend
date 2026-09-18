import React, { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import './EnterName.css';
import { BACKEND_BASE_URL } from "../config";

export default function EnterName() {
  const location = useLocation();
  const rejoin = !!location.state?.rejoin;
  const [name, setName] = useState(() => (rejoin ? localStorage.getItem("studentName") || "" : ""));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { sessionCode } = useParams();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);

    setError("");
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/sessions/${sessionCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        const studentId = data.studentId;
        localStorage.setItem("studentId", studentId);
        localStorage.setItem("studentName", name.trim());
        navigate(`/student/${sessionCode}/${studentId}`);
      } else {
        setError(data.error || "Failed to join session.");
      }
    } catch (err) {
      console.error("Join failed:", err);
      setError("Error connecting to server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="enter-name-container">
      <div className="enter-name-content">
        <div className="enter-name-header">
          <div className="session-badge">
            Session: {sessionCode}
          </div>
          <img src="/codekiwilogo.png" className="kiwi-icon" alt="CodeKiwi" />
          <h1>Welcome to CodeKiwi!</h1> {/* updated brand name */}
          <p>{rejoin ? "The session reconnected. Enter your name again to pick up where you left off." : "Let's get you set up for the session"}</p>
        </div>

        <form className="enter-name-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="name">Your Name</label>
            <input
              id="name"
              className="enter-name-input"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
            />
            {error && <div style={{ color: "#c0392b", fontSize: "13px", marginTop: "6px" }}>{error}</div>}
          </div>

          <button
            className="enter-name-button"
            type="submit"
            disabled={!name.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner"></span>
                Joining...
              </>
            ) : (
              'Join Session'
            )}
          </button>
        </form>

        <div className="enter-name-footer">
          <p>Ready to start coding? Enter your name above!</p>
        </div>
      </div>
    </div>
  );
}
