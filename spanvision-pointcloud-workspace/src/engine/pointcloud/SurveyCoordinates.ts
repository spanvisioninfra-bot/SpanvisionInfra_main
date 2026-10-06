/** Right-handed source Z-up survey axes ↔ the viewer's Y-up axes. */
export function surveyToViewer(point: [number, number, number], center: [number, number, number]): [number, number, number] {
  return [point[0] - center[0], point[2] - center[2], center[1] - point[1]];
}

export function viewerToSurvey(point: [number, number, number], center: [number, number, number]): [number, number, number] {
  return [center[0] + point[0], center[1] - point[2], center[2] + point[1]];
}

export function rotateSurveyPositions(positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 3) {
    const sourceY = positions[i + 1];
    positions[i + 1] = positions[i + 2];
    positions[i + 2] = -sourceY;
  }
}
