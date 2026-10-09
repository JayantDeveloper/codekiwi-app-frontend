import React, { useContext, useEffect, useCallback, useRef, useState } from "react";
import { TerminalContext } from "../context";
import "./RunButton.css";
import { BACKEND_BASE_URL } from "../config";
import { getTeacherToken } from "../teacherAuth";

const LIVE_CURSOR = "#a8d05f";

// One line of a test's text for the terminal: newlines shown as ⏎, capped.
const oneLine = (text, max = 70) => {
  const s = String(text || "").replace(/\s+$/, "").replace(/\n/g, " ⏎ ");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};

/**
 * Terminal feedback for a run's grade: a colored summary line, plus details of
 * the first failing test so the student sees what went in and what was expected.
 */
function describeGrade(grade) {
  if (grade.stopped) return { summary: "Stopped. This run wasn't checked.", color: "2", details: [] };
  if (!grade.graded) {
    return grade.isError
      ? { summary: "✗ Your program hit an error. Fix it and run again.", color: "31", details: [] }
      : { summary: "✔ Done", color: "32", details: [] };
  }
  const total = grade.total || 1;
  if (grade.passed) {
    return { summary: total > 1 ? `✔ All ${total} tests passed` : "✔ Correct — your output matches!", color: "32", details: [] };
  }
  if (grade.compileError) return { summary: "✗ Your program hit an error. Fix it and run again.", color: "31", details: [] };
  const summary = total > 1 ? `✗ ${grade.passedCount || 0} of ${total} tests passed` : "✗ Not quite — your output doesn't match the expected answer yet.";
  const tests = grade.tests || [];
  const i = tests.findIndex((t) => !t.passed);
  const details = [];
  if (i >= 0) {
    const t = tests[i];
    if (total > 1) details.push(`  Test ${i + 1}:`);
    if (t.input) details.push(`  input     ${oneLine(t.input)}`);
    details.push(`  expected  ${oneLine(t.expected)}`);
    // Show as many of the program's last lines as the expected answer has.
    const lines = Math.min(5, Math.max(1, String(t.expected || "").split("\n").length));
    details.push(`  got       ${oneLine(String(t.got || "").replace(/\s+$/, "").split("\n").slice(-lines).join("\n")) || "(no output)"}`);
  }
  return { summary, color: grade.isError ? "31" : "33", details };
}

// Each Run opens its own socket to /run and the program's output streams into
// the terminal. While it runs, the terminal takes keyboard input: a typed line
// is sent to the program's stdin on Enter (the terminal echoes it locally and
// handles Backspace), Ctrl+C stops the program and Ctrl+D ends its input.
export default function RunButton({ code, onOutput, onGrade, language = "python", sessionCode, studentId, slideIndex }) {
  const { terminal } = useContext(TerminalContext);
  const [running, setRunning] = useState(false);
  const wsRef = useRef(null);
  const cancelRef = useRef(null); // quietly ends the current run, if any

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

  // Leaving the page stops the program, and so does moving to another slide:
  // the button stays mounted across coding slides, and the old program's
  // output must not stream into the next slide's terminal.
  useEffect(() => () => cancelRef.current?.(), []);
  useEffect(() => () => cancelRef.current?.(), [slideIndex]);

  // Terminal accepts typing only while a program is running.
  const setLive = useCallback(
    (live) => {
      if (!terminal) return;
      terminal.options.disableStdin = !live;
      terminal.options.cursorBlink = live;
      terminal.options.theme = { ...terminal.options.theme, cursor: live ? LIVE_CURSOR : "transparent" };
      terminal.element?.parentElement?.classList.toggle("is-live", live);
      if (live) terminal.focus();
    },
    [terminal]
  );

  const stop = () => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
  };

  const runCode = () => {
    if (!terminal) return;
    if (running) return stop();

    if (!code || code.trim() === "") {
      terminal.writeln("\x1b[33mNo code to run.\x1b[0m");
      safeScroll();
      return;
    }

    terminal.reset();
    // A one-line status that is rewritten in place: Starting… -> Compiling… ->
    // Running…. Input is only taken once the program itself is running, so
    // nothing typed during a compile lands before the program's first prompt.
    let statusOpen = true;
    const status = (text, close = false) => {
      terminal.write(`\r\x1b[2K\x1b[2m>>> ${text}\x1b[0m${close ? "\r\n" : ""}`);
      statusOpen = !close;
    };
    const closeStatus = () => {
      if (statusOpen) terminal.write("\r\n");
      statusOpen = false;
    };
    status("Starting…");
    setRunning(true);

    const ws = new WebSocket(BACKEND_BASE_URL.replace(/^http/, "ws") + "/run");
    wsRef.current = ws;
    let transcript = "";
    let line = ""; // what the student has typed since the last Enter
    let done = false;
    let inputSub = null;
    let live = false;
    let grading = false;

    const send = (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const end = () => {
      done = true;
      if (cancelRef.current === cancel) cancelRef.current = null;
      inputSub?.dispose();
      setLive(false);
      setRunning(false);
      if (wsRef.current === ws) wsRef.current = null;
      safeScroll();
    };

    // Leaving the slide stops a running program. Once its tests are being
    // checked, though, the grade still counts: let it finish in the
    // background, detached from this terminal (which now shows another slide).
    let detached = false;
    const cancel = () => {
      if (done) return;
      if (grading) {
        detached = true;
        end();
        return;
      }
      end();
      try { ws.close(); } catch {}
    };
    cancelRef.current = cancel;

    const goLive = () => {
      if (live) return;
      live = true;
      status("Running…", true);
      inputSub = terminal.onData(onKeys);
      setLive(true);
    };

    const onKeys = (data) => {
      // While tests are checked only Ctrl+C (stop) means anything.
      if (grading) {
        if (data.includes("\x03")) send({ type: "stop" });
        return;
      }
      for (const ch of data.startsWith("\x1b") ? "" : data) {
        if (ch === "\r" || ch === "\n") {
          terminal.write("\r\n");
          transcript += line + "\n";
          send({ type: "input", data: line + "\n" });
          line = "";
        } else if (ch === "\x7f" || ch === "\b") {
          if (line) {
            line = [...line].slice(0, -1).join("");
            terminal.write("\b \b");
          }
        } else if (ch === "\x03") {
          send({ type: "stop" });
        } else if (ch === "\x04") {
          if (line) send({ type: "input", data: line });
          transcript += line;
          line = "";
          send({ type: "eof" });
        } else if (ch >= " ") {
          line += ch;
          terminal.write(ch);
        }
      }
      onOutput?.(transcript + line);
    };

    ws.onopen = () => {
      const start = { type: "start", code, language, sessionCode, studentId, slideIndex };
      const t = getTeacherToken(sessionCode);
      if (t) start.t = t;
      ws.send(JSON.stringify(start));
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (detached) {
        // Finished in the background after a slide change: nothing to draw.
        if (msg.type === "exit" || msg.type === "error") ws.close();
        return;
      }
      if (msg.type === "started") {
        if (msg.compiling) status("Compiling…");
        else goLive();
      } else if (msg.type === "running") {
        goLive();
      } else if (msg.type === "out") {
        closeStatus();
        terminal.write(msg.data);
        transcript += msg.data;
        onOutput?.(transcript);
        safeScroll();
      } else if (msg.type === "grading") {
        // Test cases run after the program ends: keep the student's output
        // intact and show a status line until the grade arrives.
        if (transcript && !transcript.endsWith("\n")) terminal.write("\r\n");
        status("Checking tests…");
        grading = true;
      } else if (msg.type === "exit") {
        // Clear the "Checking tests…" line, or end the program's last line.
        if (grading && statusOpen) {
          terminal.write("\r\x1b[2K");
          statusOpen = false;
        } else closeStatus();
        const atLineStart = grading || !transcript || transcript.endsWith("\n");
        if (msg.notice) terminal.write(`${atLineStart ? "" : "\r\n"}\x1b[33m${msg.notice}\x1b[0m\r\n`);
        else if (!atLineStart) terminal.write("\r\n");

        // The last lines are autograde feedback (or a plain "Done"). The plain
        // summary is also stored in the student's output so the teacher sees it.
        const grade = msg.grade || { graded: false };
        const { summary, color, details } = describeGrade(grade);
        terminal.write(`\x1b[${color}m${summary}\x1b[0m\r\n`);
        details.forEach((d) => terminal.write(`\x1b[2m${d}\x1b[0m\r\n`));
        onOutput?.(`${(msg.output || transcript || "No output.").replace(/\n+$/, "")}\n${summary}`);
        onGrade?.(grade);
        end();
      } else if (msg.type === "error") {
        // A plain-English reason (busy runner, locked editors, session ended).
        closeStatus();
        terminal.write(`\x1b[${msg.retryable ? "33" : "31"}m${msg.message}\x1b[0m\r\n`);
        end();
      }
    };

    ws.onclose = () => {
      if (done || detached) return;
      terminal.write("\r\n\x1b[33mLost connection to the code runner. Run again to retry.\x1b[0m\r\n");
      end();
    };
  };

  return (
    <button className={`run-button ${running ? "run-button--stop" : ""}`} onClick={runCode} disabled={!terminal}>
      {running ? (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="white" stroke="none" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      ) : (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="white" stroke="none" aria-hidden="true">
          <polygon points="5,3 19,12 5,21" />
        </svg>
      )}
      {running ? "Stop" : "Run"}
    </button>
  );
}
