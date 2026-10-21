import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createValidationSlice, type ValidationSlice } from './validationSlice';
import { submitValidation, pollJobStatus } from '../../api/client';

vi.mock('../../api/client', async (original) => ({
  ...await original<typeof import('../../api/client')>(),
  submitValidation: vi.fn(), pollJobStatus: vi.fn(),
}));

describe('live BIM validation progress', () => {
  const file = new File(['IFC'], 'model.ifc');
  let store: ReturnType<typeof createStore<ValidationSlice>>;
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    store = createStore<ValidationSlice>()(createValidationSlice);
    vi.mocked(submitValidation).mockResolvedValue({ job_id: 'job-1', status_url: '/api/v1/jobs/job-1' } as never);
  });
  afterEach(() => { store.getState().cancelValidation(); vi.useRealTimers(); });

  it('does not overlap slow polls, and stops when the live job completes', async () => {
    let reply!: (value: never) => void;
    vi.mocked(pollJobStatus).mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
    vi.mocked(pollJobStatus).mockResolvedValue({ status: 'completed', result: { success: true } } as never);
    await store.getState().submitValidation(file);
    await vi.advanceTimersByTimeAsync(6000);
    expect(pollJobStatus).toHaveBeenCalledTimes(1);
    reply({ status: 'processing', progress: 'Checking IFC' } as never);
    await vi.advanceTimersByTimeAsync(2000);
    expect(pollJobStatus).toHaveBeenCalledTimes(2);
    expect(store.getState().validationPhase).toBe('completed');
    await vi.advanceTimersByTimeAsync(6000);
    expect(pollJobStatus).toHaveBeenCalledTimes(2);
  });

  it('cancels in-flight polling and ignores late results after reset', async () => {
    let reply!: (value: never) => void;
    vi.mocked(pollJobStatus).mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
    await store.getState().submitValidation(file);
    const signal = vi.mocked(pollJobStatus).mock.calls[0][1];
    store.getState().resetValidation();
    expect(signal?.aborted).toBe(true);
    reply({ status: 'completed', result: { success: true } } as never);
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.getState().validationPhase).toBe('idle');
    expect(store.getState().validationResult).toBeNull();
  });
});
