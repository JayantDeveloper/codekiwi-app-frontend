import React, { useContext, useEffect, useCallback } from "react";
import { TerminalContext } from "../context";
import "./RunButton.css";
import { BACKEND_BASE_URL } from "../config";

export default function RunButton({ code, onOutput, onGrade, language = "python", sessionCode, studentId, slideIndex }) {
  const { terminal } = useContext(TerminalContext);

  const safeScroll = useCallback(() => {
    if (!terminal) return;
    try {
      setTimeout(() => {
        terminal.scrollToBottom();
        terminal.refresh(0, terminal.rows - 1);
      }, 0);
    } catch (e) {
      console.warn("Scroll failed:", e);
    }
  }, [terminal]);

  useEffect(() => {
    if (terminal) {
      terminal.writeln("\x1b[2mTerminal ready. Press Run to execute.\x1b[0m");
      safeScroll();
    }
  }, [terminal, safeScroll]);

  const runCode = async () => {
    if (!terminal) return;

    if (!code || code.trim() === "") {
      terminal.writeln("\x1b[33mNo code to run.\x1b[0m");
      safeScroll();
      return;
    }

    terminal.reset();
    terminal.writeln("\x1b[32m>>> Running...\x1b[0m");
    safeScroll();

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, sessionCode, studentId, slideIndex }),
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = await res.json();
      const baseOutput = (data.output || "No output.").trim();
      const grade = data.grade || { graded: false };

      // The last line is autograde feedback when the slide has an expected
      // answer, otherwise a plain "Done". `footerText` is the plain-text
      // version stored in the student's output so the teacher sees it too;
      // `footerAnsi` is the colored version drawn in the student's terminal.
      let footerText = "✔ Done";
      let footerAnsi = "\x1b[32m✔ Done\x1b[0m";
      if (grade.graded && grade.passed) {
        footerText = "✔ Correct — your output matches!";
        footerAnsi = "\x1b[32m✔ Correct — your output matches!\x1b[0m";
      } else if (grade.graded && !grade.passed) {
        footerText = "✗ Not quite — your output doesn't match the expected answer yet.";
        footerAnsi = "\x1b[33m✗ Not quite — your output doesn't match the expected answer yet.\x1b[0m";
      }

      const fullOutput = `${baseOutput}\n${footerText}`;

      terminal.reset();
      baseOutput.split("\n").forEach((line) => terminal.writeln(line));
      terminal.writeln(footerAnsi);
      safeScroll();

      if (onOutput) onOutput(fullOutput);
      if (onGrade) onGrade(grade);
    } catch (err) {
      terminal.writeln("\x1b[31mError: " + err.message + "\x1b[0m");
      safeScroll();
    }
  };

  return (
    <button className="run-button" onClick={runCode} disabled={!terminal}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="white" stroke="none" aria-hidden="true">
        <polygon points="5,3 19,12 5,21" />
      </svg>
      Run
    </button>
  );
}
