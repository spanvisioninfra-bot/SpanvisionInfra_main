// T12 — moveTask(id, newParentId, position?) + hasBlockingDialogOpen-export.
// Draait headless tegen de ECHTE Zustand-store (via de harness). Kernpunt: WBS-nummering volgt de
// RAUWE s.tasks-array-volgorde (flattenOrder negeert childIds), terwijl de zichtbare volgorde van
// niet-root taken juist childIds volgt (visibleRows.ts). Daarom moet moveTask met `position` op
// BEIDE plekken consistent inserten — dat bewijzen deze tests door telkens childIds én de rauwe
// array én de afgeleide WBS-codes te asserten.
import { useAppStore, test, assert, assertEq, run } from './harness';

// De harness-DOM-shim (harness.ts) definieert alleen `document.createElement`. Het importeren van
// shortcutRegistry sleept de i18n-config mee, die bij evaluatie `document.documentElement.dir` zet.
// Vul de shim daarom aan (mag de harness niet wijzigen — T12 raakt maar drie bestanden), en importeer
// shortcutRegistry DYNAMISCH in de test hieronder, zodat die evaluatie pas ná deze aanvulling draait.
(globalThis as any).document.documentElement = (globalThis as any).document.documentElement || {};

// --- helpers -------------------------------------------------------------------------------------
function reset(): void {
  useAppStore.getState().newProject();
}
function add(name: string, parentId: string | null = null): string {
  return useAppStore.getState().addTask({ name, parentId });
}
/** Namen van alle taken in RAUWE array-volgorde (na newProject bevat de array precies onze taken). */
function arrNames(): string[] {
  return useAppStore.getState().tasks.map(t => t.name);
}
/** Namen van de kinderen van `parentId` in childIds-volgorde. */
function childNames(parentId: string): string[] {
  const st = useAppStore.getState();
  const p = st.tasks.find(t => t.id === parentId)!;
  return p.childIds.map(cid => st.tasks.find(t => t.id === cid)!.name);
}
function wbs(id: string): string {
  return useAppStore.getState().tasks.find(t => t.id === id)!.wbsCode;
}
function parentOf(id: string): string | null {
  return useAppStore.getState().tasks.find(t => t.id === id)!.parentId;
}

// --- (1) zonder positie ⇒ append, byte-identiek aan het oude gedrag --------------------------------
test('zonder positie ⇒ append: childIds achteraan + rauwe array ongemoeid', () => {
  reset();
  const p = add('P');
  const a = add('A', p);
  const b = add('B', p);
  const c = add('C', p);
  const x = add('X'); // losse root
  const arrBefore = arrNames(); // [P,A,B,C,X]

  useAppStore.getState().moveTask(x, p); // geen positie ⇒ append

  assertEq(childNames(p), ['A', 'B', 'C', 'X'], 'append: X hoort achteraan in childIds');
  // Byte-identiek: de rauwe array is NIET geherordend (X blijft op zijn oude array-plek).
  assertEq(arrNames(), arrBefore, 'append laat de rauwe s.tasks-array onaangeroerd');
  // WBS volgt array-volgorde: P=1, A=1.1, B=1.2, C=1.3, X=1.4.
  assertEq([wbs(a), wbs(b), wbs(c), wbs(x)], ['1.1', '1.2', '1.3', '1.4'], 'WBS na append klopt');
});

// --- (2) positie 0 tussen bestaande siblings ⇒ volgorde exact, ook in de rauwe array ---------------
test('positie 0 ⇒ vooraan in childIds ÉN in de rauwe array (beide asserten)', () => {
  reset();
  const p = add('P');
  const a = add('A', p);
  const b = add('B', p);
  const c = add('C', p);
  const x = add('X'); // root; array = [P,A,B,C,X]

  useAppStore.getState().moveTask(x, p, 0);

  assertEq(childNames(p), ['X', 'A', 'B', 'C'], 'positie 0: X vooraan in childIds');
  // Rauwe array: X vóór A ingevoegd ⇒ [P,X,A,B,C].
  assertEq(arrNames(), ['P', 'X', 'A', 'B', 'C'], 'positie 0: X vóór A in de rauwe array');
  assertEq([wbs(x), wbs(a), wbs(b), wbs(c)], ['1.1', '1.2', '1.3', '1.4'], 'WBS na positie-0 klopt');
});

// --- (3) positie midden-in met kleinkinderen tússen de siblings in de array ------------------------
test('positie midden ⇒ WBS klopt ondanks kleinkind tussen de siblings in de array', () => {
  reset();
  const p = add('P');
  const a = add('A', p);
  const a1 = add('A1', a); // kleinkind; array-volgorde: [P,A,A1,B,X] straks
  const b = add('B', p);
  const x = add('X'); // root

  useAppStore.getState().moveTask(x, p, 1); // tussen A en B

  assertEq(childNames(p), ['A', 'X', 'B'], 'positie 1: X tussen A en B in childIds');
  // Rauwe array: X ingevoegd vóór B ⇒ [P,A,A1,X,B]. Het kleinkind A1 zit nu tussen A en X.
  assertEq(arrNames(), ['P', 'A', 'A1', 'X', 'B'], 'kleinkind A1 staat tussen de siblings in de array');
  // flattenOrder herbouwt de boom uit parentId: P=1, A=1.1, A1=1.1.1, X=1.2, B=1.3.
  assertEq(
    [wbs(p), wbs(a), wbs(a1), wbs(x), wbs(b)],
    ['1', '1.1', '1.1.1', '1.2', '1.3'],
    'WBS-nummering klopt ondanks het interspersed kleinkind',
  );
});

// --- (4) out-of-range positie klemt naar [0, aantal siblings] --------------------------------------
test('out-of-range positie klemt (te hoog ⇒ achteraan, negatief ⇒ vooraan)', () => {
  reset();
  const p = add('P');
  add('A', p);   // siblings onder P; alleen hun bestaan telt voor de klem-grenzen
  add('B', p);
  const x = add('X');
  const y = add('Y');

  useAppStore.getState().moveTask(x, p, 999); // klem naar lengte ⇒ achteraan
  assertEq(childNames(p), ['A', 'B', 'X'], 'te hoge positie klemt naar achteraan (childIds)');
  assertEq(arrNames(), ['P', 'A', 'B', 'X', 'Y'], 'te hoge positie: X achter B in de rauwe array');

  useAppStore.getState().moveTask(y, p, -5); // klem naar 0 ⇒ vooraan
  assertEq(childNames(p), ['Y', 'A', 'B', 'X'], 'negatieve positie klemt naar vooraan (childIds)');
  assertEq(arrNames(), ['P', 'Y', 'A', 'B', 'X'], 'negatieve positie: Y vóór A in de rauwe array');
});

// --- (5) bestaande guard blijft: taak naar eigen afstammeling wordt geweigerd ----------------------
test('guard: taak naar eigen afstammeling blijft geweigerd (met én zonder positie)', () => {
  reset();
  const p = add('P');
  const a = add('A', p);
  const a1 = add('A1', a);
  const arrBefore = arrNames();

  useAppStore.getState().moveTask(p, a1);      // zonder positie: P onder zijn kleinkind
  assertEq(parentOf(p), null, 'guard weigert P → afstammeling (parentId ongewijzigd)');
  assertEq(childNames(a1), [], 'guard: A1 kreeg P niet als kind');

  useAppStore.getState().moveTask(p, a1, 0);   // mét positie: idem geweigerd
  assertEq(parentOf(p), null, 'guard weigert P → afstammeling ook mét positie');
  assertEq(arrNames(), arrBefore, 'geweigerde move laat de rauwe array onaangeroerd');

  // en zelf-parent blijft ook geweigerd
  useAppStore.getState().moveTask(a, a, 0);
  assertEq(parentOf(a), p, 'guard weigert zelf-parent (mét positie)');
});

// --- (6) move naar root op een positie (root-volgorde = array-volgorde) ---------------------------
test('positie op rootniveau ⇒ root-volgorde (array) klopt', () => {
  reset();
  const rootA = add('A');
  const rootB = add('B');
  const p = add('P');
  const d = add('D', p); // array: [A,B,P,D]

  useAppStore.getState().moveTask(d, null, 1); // D wordt root op index 1

  assertEq(parentOf(d), null, 'D is nu een root');
  assertEq(childNames(p), [], 'D is uit P.childIds verwijderd');
  // Root-volgorde volgt de array: [A,D,B,P].
  assertEq(arrNames(), ['A', 'D', 'B', 'P'], 'D op root-index 1 in de rauwe array');
  assertEq(
    [wbs(rootA), wbs(d), wbs(rootB), wbs(p)],
    ['1', '2', '3', '4'],
    'WBS op rootniveau volgt de array-volgorde',
  );
});

// --- (7) hasBlockingDialogOpen is importeerbaar en reageert op een dialoog-vlag --------------------
test('hasBlockingDialogOpen: importeerbaar + true bij gezette dialoog-vlag', async () => {
  const { hasBlockingDialogOpen } = await import('@/hooks/keyboard/shortcutRegistry');
  // Zorg voor een schone ui-vlag.
  useAppStore.setState((s) => { s.ui.showNewProjectDialog = false; });
  assert(hasBlockingDialogOpen() === false, 'geen dialoog open ⇒ false');

  useAppStore.setState((s) => { s.ui.showNewProjectDialog = true; });
  assert(hasBlockingDialogOpen() === true, 'showNewProjectDialog gezet ⇒ true');

  useAppStore.setState((s) => { s.ui.showNewProjectDialog = false; }); // opruimen
});

await run();
