// De assistent-vaardigheid "Plattegrond": een bouwkundige plattegrond tekenen
// waarin de onderdelen elkaar kennen.
//
// Dit bestand bevat alleen GEGEVENS — de chip voor het assistentvenster en de
// instructie voor het model dat de MCP-opdrachten uitvoert. De rekenkunde zit
// in sparing.js, ruimte.js en maatvoering.js; de opdracht zelf in
// mcp-plattegrond.js achter `app_floorplan`. Vliesgevels en kozijnen als
// gevelelement lopen via `app_facade_element` (js/gevelelement/).
//
// Waarom een eigen instructie: de bestaande "Teken"-vaardigheid is één zin en
// levert losse vormen op. Een plattegrond vraagt om volgorde (stramien →
// dragende wanden → scheidingswanden → kozijnen → ruimten → maatvoering), om
// een schaal vóór de eerste lijn, en om controleren wat er staat.

export const PLATTEGROND_SKILL = {
  id: 'floorplan',
  icon: '🏠',
  label: 'Floor plan',
  hint: "Draw a floor plan with walls, frames, rooms, dimensions and fixtures (bathroom and kitchen)",
  invoke: "Draw an architectural floor plan. Set the scale, draw walls with doors and windows, identify rooms and add dimensions. Use English labels. Drawing request:",
  needsInput: true,
};

// Wandjoin en de Nederlandse spouwmuur (#476): hoe de app aansluitende wanden
// afsluit, en hoe je een gevel uit losse lagen tekent zonder dat de lagen in
// een hoek door elkaar heen steken. Eigen blok, ingevoegd na de wandmaten.
export const SPOUWMUUR_INSTRUCTIE =
  `
WALL JOINS AND CAVITY WALLS:
The application joins touching walls automatically. Coincident endpoints are mitered. Nearby ends of the SAME material are trimmed into a closed corner; different materials are kept separate. At a T-junction, matching materials merge, while different materials end against the face with a seam.
Disable an end join only when its exact drawn endpoint and independent cap must remain: joinStart:false or joinEnd:false, or app_update_annotation {id, props:{noJoinStart:true}} / {noJoinEnd:true}. True disables that end join; false restores it. {action:"inspect"} returns joinStart and joinEnd.
A typical cavity wall has, outside to inside, brick 100 mm (nen47-metselwerk-baksteen), air 40 mm (none), insulation 100 mm (isolatie, insulation:"pir") and calcium-silicate masonry 120 mm (nen47-metselwerk-kunststeen): 360 mm total.
Prefer the single-call layers method described below. If separate layers are needed, their centerlines lie 50, 190 and 300 mm inside the outer face; the 40 mm air cavity stays empty. Join each layer only to the same layer at corners. Apply matching openings to ALL layers, accounting for each layer's own start point when calculating alongMm.
Internal walls end on the inner leaf's face or centerline. Keep their T-junction enabled; do not terminate on the overall facade centerline.
`;

// Inrichten (#478): sanitair en keuken als parametrische symbolen op
// werkelijke maat, geplaatst met app_create_annotation. Apart gehouden zodat
// de symbool-ids en parameters op één plek staan (skill.test.mjs toetst ze
// tegen de templates).
export const INRICHTING_PROMPT =
  `
FIXTURES — sanitary ware and kitchens, after the walls:
Use app_create_annotation {type:"parametricSymbol", props:{symbolId, x, y, rotation, anchor, params:{...}}}. Dimensions are REAL MILLIMETERS, converted using the scale at that location. Preserve these protocol identifiers exactly.
Without rotation, the back (wall side) is at the top: rotation 90 places the wall to the right, 180 at the bottom and 270 to the left. anchor:"back" makes x/y the center of the back: put it ON THE WALL FACE, offset by half the wall thickness toward the room. "back-left" and "back-right" use the back corners. Without anchor, x/y is the center.
Sanitary symbols: "wandcloset" {breedte 360, diepte 530}, "staand-closet" {breedte 380, diepte 680}, "fontein" {breedte 380, diepte 250, kraan:"center"|"zijkant", spiegelen}, "hoekfontein" {breedte 330, diepte 330, spiegelen}. The corner basin's corner is top left, or top right when mirrored; use anchor:"back-left" in the room corner. Layout guidance: clear toilet room at least 900 x 1200 mm, toilet center at least 400 mm from a side wall and 600 mm clear in front; keep the basin outside the door swing.
Kitchen symbols: "aanrecht" (straight, lengte, diepte 600); "aanrecht-hoek" (L-shaped, lengte along the back wall, lengte2 along the right wall, outer corner top right or top left when mirrored, diepte 600); "kookeiland" (lengte 2400, diepte 1000, overstek for seating). All support spiegelen and onderdelen. A unit and its parts form ONE symbol and move or rotate together.
onderdelen: [{soort, vanaf, breedte, been}]. soort values: spoelbak, spoelbak-dubbel, kookplaat-4, kookplaat-5, inductie, vaatwasser, koelkast, hoge-kast. vanaf is the distance in mm from the leg's start to the part's left edge when facing the wall. Standard breedte is 600, except 900 for spoelbak-dubbel / kookplaat-5 and 800 for inductie. been 1|2 applies only to aanrecht-hoek; leg 2 starts at the outer corner and is usable after the corner zone (vanaf >= diepte). The application moves parts inside the worktop; inspect the result using app_get_annotation.
app_update_annotation {id, props:{params:{...}}} MERGES parameters and reapplies real dimensions: supplying only lengte preserves onderdelen. A straight worktop grows from its start, an L-shaped worktop from the outer corner, and an appliance from its wall.
Kitchen layout guidance: dishwasher beside the sink; at least 600 mm of worktop between sink and hob; hob at least 300 mm from a wall or tall cabinet; clear circulation space in front of worktops and between worktop and island at least 1000 mm.
`;

export const PLATTEGROND_PROMPT =
  `
DRAWING A FLOOR PLAN — app_floorplan:
Use app_floorplan to maintain relationships between walls, openings, rooms and dimensions. Do not assemble an architectural plan from unrelated overlapping annotations.
All x/y coordinates are page points at 100% zoom (app_get_viewport_state gives pageW/pageH). Dimensions such as wall thickness, clear opening, sill and offset are REAL MILLIMETERS.
1. Set the scale first with app_set_measure_scale: pixelsPerUnit = 2.8346 / denominator, unit "mm" (1:50 -> 0.0567; 1:100 -> 0.0283). One real millimeter is pixelsPerUnit page points: a 10 m facade at 1:50 is about 567 points. Choose an origin that fits the entire plan.
2. Create walls and openings using app_floorplan {action:"wall",start:{x,y},end:{x,y},thicknessMm,material,openings:[...]}. For single walls, start/end follow the CENTERLINE; match adjoining centerlines at corners. Openings use {kind:"door"|"window",widthMm,alongMm,sillMm,heightMm,swing:"left"|"right",openTo:{x,y}}. alongMm is measured from the wall start to the opening center; openTo points into the room the door opens into. The wall is split at openings. Keep returned wallIds in order.
Materials: nen47-metselwerk-baksteen, nen47-metselwerk-kunststeen, nen47-beton-gewapend, nen47-beton-prefab, isolatie (insulation: steenwol/glaswol/pir/eps/kooltherm/pur), none. Typical dimensions from the supplied presets: external wall 300-350 mm, internal load-bearing wall 200-250 mm, partition 70-100 mm; door 900 x 2315 mm, internal door leaf 830 mm, window 1200-2400 mm wide with sill 850 mm.

WALL JOINS AND CAVITY WALLS:
The application joins touching walls automatically. Coincident endpoints are mitered. Nearby ends of the SAME material are trimmed into a closed corner; different materials are kept separate. At a T-junction, matching materials merge, while different materials end against the face with a seam.
Disable an end join only when its exact drawn endpoint and independent cap must remain: joinStart:false or joinEnd:false, or app_update_annotation {id, props:{noJoinStart:true}} / {noJoinEnd:true}. True disables that end join; false restores it. {action:"inspect"} returns joinStart and joinEnd.
A typical cavity wall has, outside to inside, brick 100 mm (nen47-metselwerk-baksteen), air 40 mm (none), insulation 100 mm (isolatie, insulation:"pir") and calcium-silicate masonry 120 mm (nen47-metselwerk-kunststeen): 360 mm total.
Prefer the single-call layers method described below. If separate layers are needed, their centerlines lie 50, 190 and 300 mm inside the outer face; the 40 mm air cavity stays empty. Join each layer only to the same layer at corners. Apply matching openings to ALL layers, accounting for each layer's own start point when calculating alongMm.
Internal walls end on the inner leaf's face or centerline. Keep their T-junction enabled; do not terminate on the overall facade centerline.

2b. Use app_facade_element for curtain walls and window-frame assemblies. It creates ONE object with a frame at each end, mullions at field boundaries and one panel per field. preset "curtainWall" supports alu-50x150/alu-50x200/alu-65x250 with glass/solid/door/open panels; "windowFrame" supports hout-67x114/hout-67x139/hout-90x114 with glass/turnSash/door/solid panels.
In a wall, call {action:"create",preset,wallId,fromMm or alongMm,lengthMm,fields or fieldWidthsMm,panels:["glass","door",...]}. fromMm is measured from the wall start; alongMm addresses the center. The wall is interrupted across the facade element, which then bounds the room. Freestanding elements use start/end. Doors support {type:"door",hinge:"start"|"end",swing:"inside"|"outside"}; insideSide defaults to the right of the drawing direction.
Edit with {action:"addMullion",id,atMm}, {action:"removeMullion",id,mullion}, {action:"moveMullion",id,mullion,toMm}, {action:"setMullionType",id,mullion,mullionType}, {action:"setPanel",id,field,panel}, or {action:"divide",id,fields}. Mullion 0 and the last mullion form the outer frame; field i lies between i and i+1. Read using {action:"get",id} or {action:"get"} for all elements on the page.
3. Rooms: {action:"rooms",place:true,seeds:[{x,y,name:"Living room",number:"0.01"}]}; number is optional. The room follows its bounding wall faces and uses net floor area. Create one restrained room surface, with a thin grey edge and no hatch/fill, BEHIND the walls and frames, plus one movable room tag showing name, area and number. Do not use a separate text box. Name and number belong to the ROOM itself, not merely its tag. Edit using {action:"rooms",names:[{id or x,y,name,number}]}. Reading rooms or inspect returns id, name, number and tagIds. place:true recreates a missing tag without duplicating the room surface. In the UI, select the room through its tag. Without seeds, return an overview only. Report openEnds instead of guessing a boundary. After moving a wall, use {action:"rooms",refresh:true} to update area and tags.
4. Dimensions: {action:"dimensions",wallIds:[...],side:"left"|"right"} creates a segment chain and an overall dimension. Measure from the WALL FACE on the dimension side and the building's outer corner, using the outermost layer for layered walls. side is seen along the wall direction: left is outside a clockwise perimeter. Omit offsetMm and totalOffsetMm: defaults of 500 and 850 mm at 1:50 scale automatically. Dimensions are thin black lines showing millimeters as numbers; showUnit:true adds the unit. The dimension line extends 2 mm on paper beyond the outer extension lines, which begin 1.5 mm from the wall face. After edits use {action:"dimensions",refresh:true}.
Extend an existing chain with {action:"dimensions",chainOf:"<dimension id>",addPoints:[{x,y}]} rather than drawing a separate line. removePoints removes extension lines. Points on wall faces remain anchored; chainId identifies the complete chain.
5. Verify with {action:"inspect"}: inspect wall length/thickness, opening widths and sills, rooms/areas and openEnds. Optionally confirm the view with app_fit_page and app_screenshot_view. Each call is one undo step, reversible using app_undo. Write room names, drawing titles and explanations in English.

FRAMES AND CAVITY WALLS:
- Windows do not show a door-swing arc by default. Use showSwing:true only when requested, with windowType:"turn".
- Frames use real dimensions: timber 67 x 114 mm with a rebate, double glazing 24 mm, or a 40 mm door leaf with a swing arc. widthMm is the OVERALL FRAME SIZE; in a single wall it is also the opening width. A typical internal door has frame size 930 mm and leaf 830 mm. Detail is simplified at 1:100 compared with 1:50.
- Create a layered cavity wall in ONE app_floorplan call: {action:"wall", start, end, insideSide:"right", layers:[{thicknessMm:100,material:"nen47-metselwerk-baksteen"},{thicknessMm:40,material:"none"},{thicknessMm:100,material:"isolatie",insulation:"pir"},{thicknessMm:120,material:"nen47-metselwerk-kunststeen"}],openings:[...]}. Here start/end are the OUTER FACE, rather than the centerline. insideSide specifies the room side when looking from start to end; a clockwise perimeter has its inside on the right. material "none" creates an air cavity. The wall's top-level thicknessMm and material are ignored when layers are supplied.
- The frame sits in the cavity directly behind the outer leaf. The default outer-leaf overlap is 20 mm on each side (masonry opening = frame size - 40 mm), insulation meets the frame, and the inner-leaf clearance is 10 mm each side (opening = frame size + 20 mm). Customize framePositionMm, overlapMm, clearanceMm, stileWidthMm, frameDepthMm and leafThicknessMm. The response includes frame and layerOpeningsMm.
- Match adjoining facades at their outer-face corners using the same layers and insideSide. The application miters every layer; corners reports the mitered layers.
- Cavity-wall doors open inward by default; openTo or openSide changes the side. swing specifies the hinge side seen from the side the door opens away from. windowType supports fixed, turn, pivot and tilt.
- For facade dimensions, pass the outer leaf's wallIds (layers[0].wallIds); the chain then measures the masonry openings.
` + INRICHTING_PROMPT;
