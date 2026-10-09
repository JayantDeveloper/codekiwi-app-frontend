import React, { useEffect, useRef, useContext } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { TerminalContext } from "../context";
import "xterm/css/xterm.css";
import "./TerminalPane.css";

const TERMINAL_THEME = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "transparent",
  cursorAccent: "transparent",
  selectionBackground: "#6b8f2b40",
  black: "#1e1e1e",
  red: "#f44747",
  green: "#6b8f2b",
  yellow: "#dcdcaa",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#d4d4d4",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#a8d05f",
  brightYellow: "#e5e510",
  brightBlue: "#6cb6eb",
  brightMagenta: "#d7a7fb",
  brightCyan: "#6fe7d7",
  brightWhite: "#ffffff",
};

export default function TerminalPane({ onOutputChange }) {
  const containerRef = useRef(null);
  const { setTerminal } = useContext(TerminalContext);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.6,
      cursorStyle: "bar",
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      theme: TERMINAL_THEME,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Fits run a frame later, when the terminal may already be disposed (the
    // student moved to a slide with no editor), so check and catch inside.
    let disposed = false;
    const fit = () =>
      requestAnimationFrame(() => {
        if (disposed) return;
        try { fitAddon.fit(); } catch (e) { console.warn("Fit error:", e); }
      });
    fit();

    setTerminal(term);

    term.writeIntercept = term.writeln;
    term.writeln = (text) => {
      term.writeIntercept(text);
      if (onOutputChange) onOutputChange(text);
    };

    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(fit, 100);
    };

    // Refit whenever the pane itself changes size (window resize or dragging a
    // split divider), not only on window resize.
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);
    return () => {
      disposed = true;
      observer.disconnect();
      clearTimeout(resizeTimeout);
      term.dispose();
    };
  }, [setTerminal, onOutputChange]);

  return <div className="terminal-pane" ref={containerRef} />;
}
