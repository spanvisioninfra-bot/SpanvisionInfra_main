import * as THREE from 'three';
import type { MaterialType } from '@spanvision-infra/ifc-core';
import { classifyMaterial } from './material-classifier';

export const baseMaterials = {
  default: new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide }),
  wood: new THREE.MeshLambertMaterial({ color: 0x737373, side: THREE.DoubleSide }),
  nsi: new THREE.MeshLambertMaterial({ color: 0x666666, side: THREE.DoubleSide }),
  concrete: new THREE.MeshLambertMaterial({ color: 0x999999, side: THREE.DoubleSide }),
  steel: new THREE.MeshLambertMaterial({ color: 0xB5B5B5, side: THREE.DoubleSide }),
  glass: new THREE.MeshLambertMaterial({ color: 0xD0D0D0, transparent: true, opacity: 0.34, side: THREE.DoubleSide }),
} as const;

export const visibleColors: Record<MaterialType, number> = {
  wood: 0x858585, nsi: 0x777777, concrete: 0xA3A3A3,
  steel: 0xB8B8B8, glass: 0xD4D4D4, default: 0x969696,
};

export const COMPLETED_COLOR = 0xD0D0D0;
export const CURRENT_COLOR = 0xFFFFFF;
export const SELECTED_COLOR = 0xFFFFFF;
export const FUTURE_COLOR = 0x3A3A3A;
export const CONTEXT_COLOR = 0x242424;

export function getBaseMaterial(materialName: string): THREE.MeshLambertMaterial {
  const type = classifyMaterial(materialName);
  return baseMaterials[type];
}

export interface VisibilityState {
  hiddenExpressIds: Set<number>;
  selectedExpressIds: Set<number>;
  isolatedExpressIds: Set<number>;
  currentIndex: number;
  sortedValues: string[];
  valueGroups: Map<string, number[]>;
  lightCanvas?: boolean;
}

export function updateMeshVisibility(
  meshes: Map<number, THREE.Mesh[]>,
  state: VisibilityState,
): void {
  const { hiddenExpressIds, selectedExpressIds, isolatedExpressIds, currentIndex, sortedValues, valueGroups } = state;
  const currentColor = state.lightCanvas ? 0x17202B : CURRENT_COLOR;
  const completedColor = state.lightCanvas ? 0x59636F : COMPLETED_COLOR;
  const contextColor = state.lightCanvas ? 0x59636F : CONTEXT_COLOR;
  const futureColor = state.lightCanvas ? 0x59636F : FUTURE_COLOR;

  const hasIsolation = isolatedExpressIds.size > 0;

  const allParameterIds = new Set<number>();
  for (const ids of valueGroups.values()) {
    ids.forEach(id => allParameterIds.add(id));
  }

  const completedIds = new Set<number>();
  for (let i = 0; i < currentIndex && i < sortedValues.length; i++) {
    const ids = valueGroups.get(sortedValues[i]) || [];
    ids.forEach(id => completedIds.add(id));
  }
  const currentIds = new Set(valueGroups.get(sortedValues[currentIndex]) || []);

  for (const [expressId, meshList] of meshes) {
    const isHidden = hiddenExpressIds.has(expressId);
    const isSelected = selectedExpressIds.has(expressId);
    const isIsolated = hasIsolation && isolatedExpressIds.has(expressId);
    const isInParameter = allParameterIds.has(expressId);
    const isCompleted = completedIds.has(expressId);
    const isCurrent = currentIds.has(expressId);

    for (const mesh of meshList) {
      const mat = mesh.material as THREE.MeshLambertMaterial;
      mat.emissive?.setHex(0x000000);
      if (isHidden) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      const matName = (mesh.userData.materialName || '').toLowerCase();
      const matType = classifyMaterial(matName);

      if (hasIsolation) {
        if (isIsolated) {
          mat.color.setHex(isSelected ? currentColor : visibleColors[matType]);
          mat.transparent = matType === 'glass';
          mat.opacity = matType === 'glass' ? 0.6 : 1;
        } else {
          mat.color.setHex(contextColor);
          mat.transparent = true;
          mat.opacity = 0.07;
        }
      } else if (isSelected) {
        mat.color.setHex(currentColor);
        mat.emissive?.setHex(0x303030);
        mat.transparent = false;
        mat.opacity = 1;
      } else if (currentIndex >= 0) {
        if (!isInParameter) {
          mat.color.setHex(contextColor);
          mat.transparent = true;
          mat.opacity = 0.08;
        } else if (isCurrent) {
          mat.color.setHex(currentColor);
          mat.emissive?.setHex(0x242424);
          mat.transparent = false;
          mat.opacity = 1;
        } else if (isCompleted) {
          mat.color.setHex(completedColor);
          mat.transparent = matType === 'glass';
          mat.opacity = matType === 'glass' ? 0.58 : 0.92;
        } else {
          mat.color.setHex(futureColor);
          mat.transparent = true;
          mat.opacity = 0.14;
        }
      } else {
        mat.color.setHex(visibleColors[matType]);
        mat.transparent = matType === 'glass';
        mat.opacity = matType === 'glass' ? 0.4 : 1;
      }
    }
  }
}
