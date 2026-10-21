export const backendServices: Record<'bim' | 'stl' | 'fem', { origin: string; health: string }>;
export function backendRoutes(id: string): Array<{ src: string; dest: string; headers: Record<string, string> }>;
