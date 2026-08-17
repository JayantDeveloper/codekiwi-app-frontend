// Per-language display + starter code, shared across the student and teacher
// views so adding a language is a one-place change (no scattered ternaries).
// The `language` string comes from the session's meta.json (set by the add-on).

export const LANG_META = {
  python: {
    label: "Python",
    file: "main.py",
    starter: '# Write your code here\nprint("Hello, World!")\n',
  },
  javascript: {
    label: "JavaScript",
    file: "main.js",
    starter: '// Write your code here\nconsole.log("Hello, World!");\n',
  },
  java: {
    label: "Java",
    // Java requires the public class to match the filename; the executor always
    // writes the source as Main.java, so student code must declare `public class Main`.
    file: "Main.java",
    starter:
      'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
  },
};

// Safe lookup with a Python fallback for any unexpected value.
export function langMeta(language) {
  return LANG_META[language] || LANG_META.python;
}
