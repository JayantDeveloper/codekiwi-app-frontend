import React, { useContext, useEffect, useCallback, useRef, useState } from "react";
import { TerminalContext } from "../context";
import "./RunButton.css";
import { BACKEND_BASE_URL } from "../config";
import { getTeacherToken } from "../teacherAuth";

const LIVE_CURSOR = "#a8d05f";

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

    const cancel = () => {
      if (done) return;
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
      } else if (msg.type === "exit") {
        // The last line is autograde feedback when the slide has an expected
        // answer, otherwise a plain "Done". `footerText` is the plain-text
        // version stored in the student's output so the teacher sees it too;
        // the colored version is drawn in the student's terminal.
        closeStatus();
        const grade = msg.grade || { graded: false };
        let footerText = "✔ Done";
        let color = "32";
        if (grade.stopped) {
          footerText = "Stopped. This run wasn't checked.";
          color = "2";
        } else if (grade.graded && grade.passed) footerText = "✔ Correct — your output matches!";
        else if (grade.isError) {
          footerText = "✗ Your program hit an error. Fix it and run again.";
          color = "31";
        } else if (grade.graded && !grade.passed) {
          footerText = "✗ Not quite — your output doesn't match the expected answer yet.";
          color = "33";
        }
        if (msg.notice) terminal.write(`${transcript && !transcript.endsWith("\n") ? "\r\n" : ""}\x1b[33m${msg.notice}\x1b[0m\r\n`);
        else if (transcript && !transcript.endsWith("\n")) terminal.write("\r\n");
        terminal.write(`\x1b[${color}m${footerText}\x1b[0m\r\n`);
        onOutput?.(`${(msg.output || transcript || "No output.").replace(/\n+$/, "")}\n${footerText}`);
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
      if (done) return;
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
