import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { SQLite, sql } from "@codemirror/lang-sql";
import { bracketMatching, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "#f2c14e" },
  { tag: [t.string, t.special(t.string)], color: "#a8d58a" },
  { tag: [t.number, t.bool, t.null], color: "#7fb2ff" },
  { tag: [t.lineComment, t.blockComment], color: "#6f6a5e", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation, t.paren, t.bracket], color: "#a39b88" },
  { tag: [t.typeName, t.standard(t.name)], color: "#6fd6e6" },
  { tag: [t.name, t.propertyName], color: "#ece3cf" },
  { tag: t.special(t.name), color: "#e58a6f" },
]);

const theme = EditorView.theme({
  "&": { color: "#ece3cf" },
  ".cm-content": { caretColor: "#f2c14e", padding: "10px 0" },
  ".cm-line": { padding: "0 14px" },
  ".cm-placeholder": { color: "#6f6a5e" },
});

/**
 * The console's editor: SQLite's SQL, the database's tables and columns
 * completed as you type, ⌘↵ to run.
 */
export function SqlEditor({ value, onChange, onRun, schema }: { value: string; onChange: (v: string) => void; onRun: () => void; schema: Record<string, string[]> }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const handlers = useRef({ onChange, onRun });
  handlers.current = { onChange, onRun };

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ icons: false }),
          placeholder("SELECT * FROM quest_en WHERE level = 10"),
          keymap.of([
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => {
                handlers.current.onRun();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          language.current.of(sql({ dialect: SQLite, upperCaseKeywords: true })),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    v.focus();
    return () => v.destroy();
    // (made once; the text and the schema follow below)
  }, []);

  // a text from outside (a saved query, a link): replaces the editor's
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(sql({ dialect: SQLite, schema, upperCaseKeywords: true })) });
  }, [schema]);

  return <div ref={host} className="h-full min-h-0" />;
}
