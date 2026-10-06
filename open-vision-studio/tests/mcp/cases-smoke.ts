// Rooktest: bewijst dat de glob-lus in run.sh een cases-*.ts-bestand bundelt, draait en de
// exitcode als poort gebruikt. Raakt de echte store (via de harness) en de Snapshot-fabriek.
import { useAppStore, test, assert, run } from './harness';
import { createSnapshot } from '@/state/snapshot';

test('store heeft een project', () => {
  const state = useAppStore.getState();
  assert(state.project != null, 'useAppStore.getState().project is null/undefined');
});

test('createSnapshot geeft een object met tasks', () => {
  const snap = createSnapshot(useAppStore.getState());
  assert(snap != null && typeof snap === 'object', 'createSnapshot gaf geen object');
  assert(Array.isArray(snap.tasks), 'snapshot.tasks is geen array');
});

await run();
