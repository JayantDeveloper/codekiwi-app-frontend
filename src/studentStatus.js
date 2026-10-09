import { parseCodingNote } from "./testCases";
// Shared student-status logic for the teacher views.
//
// Status is driven by real signals the backend records on each run
// (autograde pass/fail, crash, stuck streak) plus the student's own
// "I'm stuck" hand-raise. It degrades gracefully for records created
// before autograding existed (no lastRunAt) by sniffing their output.

export const STATUS_LABEL = {
  help: "Needs help",
  done: "Done",
  error: "Error",
  coding: "Coding",
  empty: "No code",
};

// Sort weight for "needs help first": most urgent lowest.
export const STATUS_ORDER = { help: 0, error: 1, coding: 2, empty: 3, done: 4 };

// Order the filter tabs appear in the dashboard.
export const STATUS_FILTERS = [
  ["all", "All"],
  ["help", "Needs help"],
  ["error", "Errors"],
  ["coding", "Coding"],
  ["done", "Done"],
  ["empty", "No code"],
];

export function getStatus(student) {
  const hasCode = (student.code || "").trim().length > 0;

  // Highest priority: an explicit ask for help, or an auto-detected stuck run
  // (several failed/crashing runs in a row).
  if (student.handRaised || (student.runFailStreak || 0) >= 3) return "help";

  // Objective completion: their most recent run matched the expected output.
  if (student.lastRunPassed === true) return "done";

  if (!hasCode) return "empty";
  if (student.lastRunError === true) return "error";

  // Fallback for records that predate autograding (never ran through the new
  // backend): sniff the last output string the way the old dashboard did.
  if (student.lastRunAt === undefined) {
    const out = (student.output || "").toLowerCase();
    if (
      out &&
      out !== "no terminal output yet." &&
      (out.includes("error") || out.includes("traceback") || out.includes("exception"))
    ) {
      return "error";
    }
  }

  return "coding";
}

// How many coding questions the student has gotten right so far.
export function passedCount(student) {
  const grades = student.grades || {};
  return Object.values(grades).filter((g) => g && g.passed).length;
}

// Total number of GRADED coding slides in the deck (those with test cases):
// the score denominator, since prompt-only slides can never be marked correct.
export function countCodingSlides(notes) {
  if (!Array.isArray(notes)) return 0;
  return notes.filter((n) => parseCodingNote(n).tests.length > 0).length;
}

// Parsing is shared with the backend grader and the add-on (see testCases.js).
// The notes (and so the answers) are teacher-only; students never receive them.
export { parseCodingNote };
