import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateMeshVisibility, type VisibilityState } from '../src';

function fixture() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  mesh.userData.materialName = 'concrete';
  return { mesh, meshes: new Map([[10, [mesh]]]) };
}
const state = (overrides: Partial<VisibilityState> = {}): VisibilityState => ({
  hiddenExpressIds: new Set(), selectedExpressIds: new Set(), isolatedExpressIds: new Set(),
  currentIndex: 0, sortedValues: ['1'], valueGroups: new Map([['1', [10]]]), ...overrides,
});
describe('viewer visibility', () => {
  it('retains explicit hiding through state refreshes and restores it on reset', () => {
    const { mesh, meshes } = fixture();
    updateMeshVisibility(meshes, state({ hiddenExpressIds: new Set([10]) }));
    expect(mesh.visible).toBe(false);
    updateMeshVisibility(meshes, state());
    expect(mesh.visible).toBe(true);
  });
  it('contrasts active geometry against each canvas theme', () => {
    const { mesh, meshes } = fixture();
    updateMeshVisibility(meshes, state());
    expect(mesh.material.color.getHex()).toBe(0xffffff);
    updateMeshVisibility(meshes, state({ lightCanvas: true }));
    expect(mesh.material.color.getHex()).toBe(0x17202b);
    expect(mesh.material.opacity).toBe(1);
  });
});
