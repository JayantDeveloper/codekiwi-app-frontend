import React from "react";
import Editor from "@monaco-editor/react";
import "./EditorPane.css";

const CODEKIWI_THEME = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6a9955", fontStyle: "italic" },
    { token: "keyword", foreground: "569cd6" },
    { token: "keyword.control", foreground: "c586c0" },
    { token: "string", foreground: "ce9178" },
    { token: "string.escape", foreground: "d7ba7d" },
    { token: "number", foreground: "b5cea8" },
    { token: "type", foreground: "4ec9b0" },
    { token: "class", foreground: "4ec9b0" },
    { token: "function", foreground: "dcdcaa" },
    { token: "variable", foreground: "9cdcfe" },
    { token: "variable.language", foreground: "4fc1ff" },
    { token: "constant", foreground: "4fc1ff" },
    { token: "operator", foreground: "d4d4d4" },
    { token: "delimiter", foreground: "d4d4d4" },
  ],
  colors: {
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4",
    "editorCursor.foreground": "#6b8f2b",
    "editorCursor.background": "#1e1e1e",
    "editor.selectionBackground": "#6b8f2b50",
    "editor.inactiveSelectionBackground": "#6b8f2b30",
    "editor.lineHighlightBackground": "#2a2a2a",
    "editor.lineHighlightBorder": "#00000000",
    "editorLineNumber.foreground": "#5a5a5a",
    "editorLineNumber.activeForeground": "#a8d05f",
    "editor.selectionHighlightBackground": "#6b8f2b20",
    "editorBracketMatch.background": "#6b8f2b30",
    "editorBracketMatch.border": "#6b8f2b80",
    "scrollbarSlider.background": "#6b8f2b30",
    "scrollbarSlider.hoverBackground": "#6b8f2b50",
    "scrollbarSlider.activeBackground": "#6b8f2b80",
    "editorWidget.background": "#252526",
    "editorWidget.border": "#3c3c3c",
    "editorSuggestWidget.background": "#252526",
    "editorSuggestWidget.border": "#3c3c3c",
    "editorSuggestWidget.selectedBackground": "#6b8f2b40",
    "editorSuggestWidget.highlightForeground": "#a8d05f",
    "editorOverviewRuler.border": "#00000000",
    "editor.findMatchBackground": "#a8d05f40",
    "editor.findMatchHighlightBackground": "#6b8f2b25",
    "editorGutter.background": "#1e1e1e",
    "editorIndentGuide.background": "#303030",
    "editorIndentGuide.activeBackground": "#6b8f2b40",
  },
};

function beforeMount(monaco) {
  monaco.editor.defineTheme("codekiwi-dark", CODEKIWI_THEME);
}

export default function EditorPane({ value, onCodeChange, readOnly = false, language = "python" }) {
  return (
    <div className="editor-pane">
      <Editor
        height="100%"
        language={language}
        theme="codekiwi-dark"
        value={value}
        beforeMount={beforeMount}
        onChange={(val) => {
          if (!readOnly) onCodeChange?.(val || "");
        }}
        options={{
          readOnly,
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          // No scrollbar map: its cursor/bracket marks read as stray gray boxes
          // in a short student program.
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          fontSize: 14,
          lineHeight: 22,
          fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
          fontLigatures: true,
          renderLineHighlight: "all",
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
        }}
      />
    </div>
  );
}
