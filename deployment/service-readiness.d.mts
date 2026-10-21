export function serviceIsReady(id: string, data: unknown): boolean;
export function waitForBackend(id: string, url: string, options?: {
  signal?: AbortSignal;
  timeoutMs?: number;
  onWaiting?: () => void;
}): Promise<void>;
