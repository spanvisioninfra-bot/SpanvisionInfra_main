// Spanvision assistant skill set.
//
// Each skill is a capability the assistant can perform on the open PDF. Clicking
// a skill chip sends `invoke` as a user message; via the provider chain it reaches
// the brain (Claude Code over the MCP relay, or any AI provider) which executes
// it using the app's MCP tools. SKILLS_SYSTEM_PROMPT teaches the brain how.

import { PLATTEGROND_SKILL, PLATTEGROND_PROMPT } from './plattegrond/skill.js';

export const ASSISTANT_SKILLS = [
  {
    id: 'translate',
    icon: '🌐',
    label: 'Translate',
    hint: "Translate the document text into English",
    invoke: "Translate the text of the open document into English and present the translation clearly.",
  },
  {
    id: 'summarize',
    icon: '📝',
    label: 'Summarize',
    hint: "Summarize the document or drawing",
    invoke: "Summarize the open document or drawing in English, including its purpose, main components and points needing attention.",
  },
  {
    id: 'draw',
    icon: '✏️',
    label: 'Draw',
    hint: "Draw an element or annotation",
    invoke: "Draw on the document:",
    needsInput: true,
  },
  {
    id: 'detect-doors',
    icon: '🚪',
    label: 'Find doors',
    hint: "Detect and mark the doors on the floor plan",
    invoke: "Inspect the floor plan, identify the doors and mark each with an annotation and a short English label.",
  },
  {
    id: 'structural-layout',
    icon: '🏗️',
    label: 'Structural layout',
    hint: "Grid, columns, beams, floor panels, span directions and structural schedule",
    invoke: "Set out the structure on the drawing: grid, columns at grid nodes, beams along grid lines, span directions, level dimensions, position labels and a structural schedule. Brief:",
    needsInput: true,
  },
  PLATTEGROND_SKILL,
];

export const SKILLS_SYSTEM_PROMPT =
  `You can act on the open PDF using the application's MCP tools.
- Translate or summarize: use app_screenshot_view (width 2000) to read the page, then return an English explanation.
- Draw with app_create_annotation. Coordinates use page points at 100% zoom; obtain pageW/pageH using app_get_viewport_state.
- Find doors: app_fit_page, then app_screenshot_view (width 2000); identify doors visually and mark each using app_create_annotation. Convert screenshot pixels to page points using pageW/pageH.
Respond in English, execute the requested actions and briefly explain the changes.
STRUCTURAL LAYOUT:
- Use app_structural_layout for the full grid, columns, beams, span arrows, level dimensions, position labels and IFC-grouped schedule in ONE undo step. Do not build a complete layout from separate app_create_annotation calls.
- baysX/baysY use REAL MILLIMETERS, e.g. "3x5400" or [5400,5400,6000]. The tool converts them at scale (default "1:100") and calibrates measurements and app_get_takeoff. Never convert millimeters to points yourself for this tool.
- origin is the first grid intersection in PAGE POINTS at 100% zoom, with top left 0,0. Reserve room for gridExtensionMm (default 1500 mm) and the schedule.
- Sections include "HE200B", "HEA 200", "IPE 300", "UNP 200", "Koker 100x100x5", "L 100x100x10" and concrete "300x500" (width x height in mm). Unknown sizes must be rejected rather than silently substituted.
- beams.direction: x, y or both. floors.direction: x, y or shortest. levelMm:3000 produces "+3.000".
- Call dryRun:true first; after reviewing the result, repeat without dryRun. Inspect counts with app_list_annotations or app_get_takeoff; app_undo reverses the complete layout.
- Grid bubbles are linked by direction. Moving an end handle moves its aligned group. app_get_annotation reports gridAlignment with group, locked, linkedEnds and canLock. app_update_annotation props alignStart:false or alignEnd:false releases an end; true relinks it. Moving a whole grid line retains its linkage.
- Individual structural elements use app_create_annotation: type "betonbalk" with startX/startY/endX/endY, breedteMm/hoogteMm, tagTonen/tagTekst; or type "parametricSymbol" with symbolId "wapeningsstaaf", "netwapening", "wapeningskorf", "wapeningVerdeling" (aantal/diameter), "beugel" (diameter/afstand), "oplegging", "puntlast", "q-last", "windverband", "scharnier-verbinding", "paal-aanzicht-type-1", "CPT", "paalpuntniveau", "peilmaat" (value), "stramien" (label/orientation) or "overspanningspijl-vloer" (length/tekst).
- Set an independent scale using app_set_measure_scale; at 1:100, one real millimeter is 0.0283465 page points (72/25.4 divided by 100).
Preserve all tool names, field names and material/symbol identifiers exactly. Use English for generated human-readable text.
` + PLATTEGROND_PROMPT;
