/** Tests target the current BCF issue queue and real ZIP output. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import JSZip from 'jszip';
import { createBcfSlice, type BcfSlice } from '../../../store/slices/bcfSlice';
import { createBcfIssue } from '../../../types/bcfIssue';
import { generateBcfZip } from '../../../lib/bcfZipGenerator';
import { initOidc, isOidcConfigured, signinRedirect } from '../../../lib/oidcManager';
vi.mock('../../../lib/oidcManager', () => ({
  isOidcConfigured: vi.fn(() => false), initOidc: vi.fn(),
  signinRedirect: vi.fn(async () => {}), processOidcCallback: vi.fn(async () => null),
  getSignedInUser: vi.fn(async () => null), signout: vi.fn(async () => {}),
  onTokenRenewed: vi.fn(() => () => {}),
}));
const issue = (title = 'Missing fire rating') => createBcfIssue(title,
  { specificationName: 'Fire safety', elementGlobalId: 'wall-guid' }, {
    topic: { title, description: 'Rating < 60 & requires review', topic_status: 'Open' },
    viewpoint: { components: { selection: [{ ifc_guid: 'wall-guid' }] } },
    comment: { comment: 'Check wall properties' },
  });
function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
describe('BCF issue queue and exports', () => {
  let store: ReturnType<typeof create<BcfSlice>>;
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    vi.mocked(isOidcConfigured).mockReturnValue(false);
    store = create<BcfSlice>(createBcfSlice);
  });
  it('starts empty and disconnected', () => {
    expect(store.getState().bcfIssues).toEqual([]);
    expect(store.getState().bcfPhase).toBe('disconnected');
  });
  it('adds a complete issue with its viewpoint', () => {
    const entry = issue(); store.getState().bcfAddIssue(entry);
    expect(store.getState().bcfIssues).toEqual([entry]);
    expect(entry.pushState).toBe('queued');
  });
  it('adds multiple issues in order', () => {
    const entries = [issue('First'), issue('Second')];
    store.getState().bcfAddIssues(entries);
    expect(store.getState().bcfIssues).toEqual(entries);
  });
  it('updates only the selected issue while preserving its source', () => {
    const entries = [issue('First'), issue('Second')]; store.getState().bcfAddIssues(entries);
    store.getState().bcfUpdateIssue(entries[0].id, { title: 'Reviewed', pushState: 'pushed' });
    expect(store.getState().bcfIssues[0]).toMatchObject({ title: 'Reviewed', source: entries[0].source });
    expect(store.getState().bcfIssues[1]).toEqual(entries[1]);
  });
  it('ignores updates for unknown IDs', () => {
    const entry = issue(); store.getState().bcfAddIssue(entry);
    store.getState().bcfUpdateIssue('unknown', { title: 'Incorrect' });
    expect(store.getState().bcfIssues).toEqual([entry]);
  });
  it('removes only the specified issue', () => {
    const entries = [issue(), issue()]; store.getState().bcfAddIssues(entries);
    store.getState().bcfRemoveIssue(entries[0].id);
    expect(store.getState().bcfIssues).toEqual([entries[1]]);
  });
  it('clears the queue', () => {
    store.getState().bcfAddIssues([issue(), issue()]); store.getState().bcfClearIssues();
    expect(store.getState().bcfIssues).toEqual([]);
  });
  it('retains remote push errors for retry', () => {
    const entry = issue(); store.getState().bcfAddIssue(entry);
    store.getState().bcfUpdateIssue(entry.id, { pushState: 'failed', pushError: 'Unavailable' });
    expect(store.getState().bcfIssues[0]).toMatchObject({ pushState: 'failed', pushError: 'Unavailable' });
  });
  it('creates distinct IDs and valid timestamps', () => {
    const first = issue(), second = issue(); expect(first.id).not.toBe(second.id);
    expect(Number.isNaN(Date.parse(first.createdAt))).toBe(false);
  });
  it('exports escaped topic markup and selected IFC elements', async () => {
    const zip = await JSZip.loadAsync(await blobBytes(await generateBcfZip([issue('Wall < A & B'), issue('Second')])));
    expect(await zip.file('bcf.version')!.async('string')).toContain('VersionId="2.1"');
    const markups = Object.keys(zip.files).filter(name => name.endsWith('markup.bcf'));
    expect(markups).toHaveLength(2);
    const markup = await zip.file(markups[0])!.async('string');
    expect(markup).toContain('Wall &lt; A &amp; B');
    expect(markup).toContain('Rating &lt; 60 &amp; requires review');
    expect(await zip.file(markups[0].replace('markup.bcf', 'viewpoint.bcfv'))!.async('string')).toContain('wall-guid');
  });
  it('exports an empty queue without fabricated topics', async () => {
    const zip = await JSZip.loadAsync(await blobBytes(await generateBcfZip([])));
    expect(Object.keys(zip.files).filter(name => name.endsWith('markup.bcf'))).toEqual([]);
  });
  it('reports missing OIDC configuration', async () => {
    await store.getState().bcfLoginOidc();
    expect(store.getState().bcfError).toMatch(/not configured/i);
    expect(signinRedirect).not.toHaveBeenCalled();
  });
  it('initializes the OIDC client before login', async () => {
    vi.mocked(isOidcConfigured).mockReturnValue(true); store = create<BcfSlice>(createBcfSlice);
    await store.getState().bcfLoginOidc();
    expect(initOidc).toHaveBeenCalledOnce(); expect(signinRedirect).toHaveBeenCalledOnce();
    expect(vi.mocked(initOidc).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(signinRedirect).mock.invocationCallOrder[0]);
  });
  it('clears credentials on logout and preserves local issues', async () => {
    localStorage.setItem('bcf-platform-apikey', 'test-key');
    localStorage.setItem('bcf-platform-url', 'https://example.test');
    const entry = issue(); store.getState().bcfAddIssue(entry);
    store.setState({ bcfAuth: { method: 'apikey', accessToken: 'test-key' }, bcfPhase: 'connected' });
    await store.getState().bcfLogout();
    expect(localStorage.getItem('bcf-platform-apikey')).toBeNull();
    expect(store.getState().bcfAuth).toEqual({ method: 'none' });
    expect(store.getState().bcfPhase).toBe('disconnected');
    expect(store.getState().bcfIssues).toEqual([entry]);
  });
});
