import { useState } from "react";
import { useActieveBron, useZetActieveBron } from "../../store/actiefBlad";
import "./HelpPanel.css";

/**
 * Shown in the preview pane when the editor is empty. Mirrors the CalcPAD
 * "How it works" reference card so users discover the language without
 * leaving the app. Sections with a `+` prefix can be expanded.
 *
 * Clicking an inline snippet inserts it into the editor.
 */

interface Section {
  title: string;
  /** When set, items render as a collapsible list. */
  items?: Item[];
  /** When set, render as a single paragraph / inline list (no toggle). */
  inline?: { label: string; insert?: string; isCode?: boolean }[];
  /** Plain-text body shown after the title (no inserts). */
  description?: string;
}

interface Item {
  label: string;
  insert?: string;
  description?: string;
}

const SECTIONS: Section[] = [
  {
    title: "How it works",
    description:
      "Enter formulas and quoted text in the left editor. Press F5 or click Calculate to evaluate." +
      "Results appear on the right. Export to PDF, IFCX or HTML using the File menu.",
  },
  {
    title: "Numbers and arrays",
    inline: [
      { label: "Real", insert: "1.5", isCode: true },
      { label: "Complex", insert: "3 - 2i", isCode: true },
      { label: "Vector", insert: "[v_1; v_2; v_3]", isCode: true },
      { label: "Matrix", insert: "[a; b | c; d]", isCode: true },
    ],
  },
  {
    title: "Variables",
    items: [
      { label: "Simple", insert: "b = 300 mm", description: "Set 'b' to 300 mm" },
      { label: "Subscript", insert: "V_b,0 = 27 m/s", description: "Commas allowed in subscripts" },
      { label: "Greek letter", insert: "γ_Q = 1.5", description: "γ, σ, ψ, μ, π …" },
    ],
  },
  {
    title: "Constants",
    inline: [
      { label: "π", insert: "pi" },
      { label: "e", insert: "e" },
      { label: "φ", insert: "phi" },
      { label: "γc · γs · γa · γw", insert: "γ_c" },
    ],
  },
  {
    title: "Operators",
    inline: [
      { label: "+ − × ÷", insert: "+", isCode: true },
      { label: "^", insert: "^", isCode: true },
      { label: "%", insert: "%", isCode: true },
      { label: "≡ ≠ ≤ ≥", insert: "≤", isCode: true },
      { label: "and · or · not", insert: "and(a; b)" },
    ],
  },
  {
    title: "Functions",
    items: [
      { label: "f(x) = …", insert: "f(x) = x^2 + 1", description: "Custom function" },
      { label: "sin / cos / tan", insert: "sin(θ)" },
      { label: "log / log10 / lg", insert: "log10(x)" },
      { label: "sqrt / sqr / abs", insert: "sqrt(x)" },
      { label: "min / max / round / floor / ceil", insert: "max(a; b)" },
      { label: "if (ternary)", insert: "if(cond; t; f)" },
      { label: "take / hlookup / vlookup", insert: "take(1; vec)" },
    ],
  },
  {
    title: "Conditionals",
    items: [
      { label: "#if … #end if", insert: "#if cond\n\t…\n#end if" },
      { label: "#if … #else if … #else … #end if", insert: "#if a > 0\n\t…\n#else if a == 0\n\t…\n#else\n\t…\n#end if" },
    ],
  },
  {
    title: "Loops",
    items: [
      { label: "#repeat n … #end repeat", insert: "#repeat 10\n\t…\n#end repeat" },
      { label: "#for var = lo : hi … #loop", insert: "#for i = 1 : 9\n\t…\n#loop" },
      { label: "#break (vroegtijdig stoppen)", insert: "#break" },
    ],
  },
  {
    title: "Macros and includes",
    items: [
      { label: "#def name(args) … #end def", insert: "#def line$(x1$; y1$; x2$; y2$)\n\t'<line x1=\"'x1$'\" y1=\"'y1$'\" .../>\n#end def" },
      { label: "#def Name$ = value", insert: "#def style1$ = \"stroke:black\"" },
      { label: "#include file.cpd", insert: "#include svg_drawing.cpd" },
    ],
  },
  {
    title: "Drawings",
    items: [
      { label: "@svg … @end (handwritten)", insert: "@svg\n\t<rect width=\"100\" height=\"50\"/>\n@end" },
      { label: "@img(file.png)", insert: "@img(detail.png)" },
      { label: "@img(file.svg) — inline embed", insert: "@img(detail.svg)" },
      { label: "$Plot{ f(x) @ x = lo : hi }", insert: "$Plot{f(x) @ x = -10 : 10}" },
    ],
  },
  {
    title: "Text and headings",
    items: [
      { label: "\"Project title", insert: "\"Project Titel" },
      { label: "'<b>Bold</b>", insert: "'<b>Vetgedrukt</b>" },
      { label: "# Chapter", insert: "# 1. Inputs" },
      { label: "// comment", insert: "// commentaar" },
    ],
  },
  {
    title: "Angle units",
    inline: [
      { label: "#deg", insert: "#deg" },
      { label: "#rad", insert: "#rad" },
      { label: "#gra", insert: "#gra" },
    ],
  },
  {
    title: "Common units",
    description:
      "Length: mm · cm · m · km   ·   Mass: g · kg · tonne   ·   Force: N · kN · MN   ·" +
      "Pressure: Pa · kPa · MPa · GPa   ·   Angle: deg · rad · grad   ·   Time: s · min · h",
  },
];

export default function HelpPanel() {
  const source = useActieveBron();
  const setSource = useZetActieveBron();
  // First two sections always open; rest start collapsed.
  const [open, setOpen] = useState<Set<number>>(new Set([0, 1, 2]));

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const insert = (snippet: string) => {
    const sep = source.length === 0 || source.endsWith("\n") ? "" : "\n";
    setSource(source + sep + snippet + "\n");
  };

  return (
    <div className="help-panel">
      <header className="help-panel-header">
        <h2 className="help-panel-title">Vision Calculation Studio — Language reference</h2>
        <p className="help-panel-subtitle">
          Click a snippet to insert it into the editor. Typing in the editor closes this panel.
        </p>
      </header>
      <div className="help-panel-body">
        {SECTIONS.map((sec, i) => {
          const isCollapsible = !!(sec.items && sec.items.length > 0);
          const isOpen = !isCollapsible || open.has(i);
          return (
            <section key={sec.title} className={`help-section${isOpen ? " open" : ""}`}>
              <button
                type="button"
                className="help-section-header"
                onClick={() => isCollapsible && toggle(i)}
                aria-expanded={isOpen}
                aria-disabled={!isCollapsible}
              >
                {isCollapsible && (
                  <span className="help-section-toggle" aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                )}
                <span className="help-section-title">{sec.title}</span>
              </button>
              {isOpen && (
                <div className="help-section-content">
                  {sec.description && <p className="help-section-desc">{sec.description}</p>}
                  {sec.inline && (
                    <div className="help-section-inline">
                      {sec.inline.map((it, j) => (
                        <button
                          key={j}
                          type="button"
                          className={`help-chip${it.isCode ? " is-code" : ""}`}
                          onClick={() => it.insert && insert(it.insert)}
                          title={it.insert ? `Voeg in: ${it.insert}` : undefined}
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {sec.items && (
                    <ul className="help-section-items">
                      {sec.items.map((it, j) => (
                        <li key={j}>
                          <button
                            type="button"
                            className="help-item"
                            onClick={() => it.insert && insert(it.insert)}
                            title={it.insert ? "Click to insert" : undefined}
                          >
                            <span className="help-item-label">{it.label}</span>
                            {it.description && (
                              <span className="help-item-desc"> — {it.description}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
