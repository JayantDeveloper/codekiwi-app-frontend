import { useCallback, useRef, useState } from "react";

/**
 * Draggable split between two panes inside `containerRef`.
 *
 * `axis: "x"` (default) sizes the RIGHT pane (editor) as a % of container
 * width; `axis: "y"` sizes the BOTTOM pane (terminal) as a % of container
 * height. `editorPct` is that sized pane's share, clamped to [min, max].
 * Window listeners are attached only while dragging, so nothing lingers
 * between drags.
 */
export function useSplitPane(defaultPct = 35, { min = 20, max = 70, axis = "x" } = {}) {
  const [editorPct, setEditorPct] = useState(defaultPct);
  const containerRef = useRef(null);
  const draggingRef = useRef(false);

  const onMove = useCallback(
    (e) => {
      if (!draggingRef.current || !containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      let pct =
        axis === "y"
          ? ((r.bottom - e.clientY) / r.height) * 100
          : ((r.right - e.clientX) / r.width) * 100;
      pct = Math.min(max, Math.max(min, pct));
      setEditorPct(pct);
    },
    [min, max, axis]
  );

  const onUp = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }, [onMove]);

  const startDrag = useCallback(
    (e) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = axis === "y" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [onMove, onUp, axis]
  );

  return { editorPct, setEditorPct, containerRef, startDrag };
}
