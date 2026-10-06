export interface LocalProfile { name: string; }
export function readLocalProfile(storage?: Storage): LocalProfile;
export function saveLocalProfile(value: unknown, storage?: Storage): LocalProfile;
