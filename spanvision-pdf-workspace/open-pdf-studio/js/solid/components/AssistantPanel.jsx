// Assistant — floating chat panel (bottom-right) + launcher button. Two ways to
// answer, tried in order:
//   1. Claude (Anthropic) -> direct API with a locally stored API key
//   2. MCP relay          -> an external MCP client answers via the app server
import { createSignal, For, Show, createEffect } from 'solid-js';
import { registerAssistantSubmit, registerAssistantMessages, enqueueAssistantQuestion, relayClientActive } from '../../assistant-mcp-relay.js';
import { ASSISTANT_SKILLS, SKILLS_SYSTEM_PROMPT } from '../../assistant-skills.js';
import { getActiveDocument } from '../../core/state.js';
import { useTranslation } from '../../i18n/useTranslation.js';

const GREETING = 'Welcome to the **Spanvision assistant**. Summarize, translate, draw or review your document. Choose a suggestion below or ask a question.';
const ANTHROPIC_KEY_LS = 'opds-anthropic-key';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

// Minimal markdown-lite rendering (bold, inline code, line breaks). The AI text
// is HTML-escaped first so it can never inject markup.
function renderContent(text) {
  const esc = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function describeAiError(err) {
  const raw = String(err?.message ?? err ?? '').trim();
  if (/Claude API 401|invalid x-api-key|authentication_error/i.test(raw)) {
    return '⚠️ Invalid Claude (Anthropic) API key. Check the key using the 🔑 button at the top right of this panel.';
  }
  if (/Claude API 4\d\d|Claude API 5\d\d/i.test(raw)) {
    return `⚠️ The Claude API returned an error.

_Detail: ${raw}_`;
  }
  if (/onbereikbaar|connection|econn|refused|failed to connect|timed out|failed to fetch/i.test(raw)) {
    return '⚠️ Unable to connect to the AI service.';
  }
  return `⚠️ AI request failed.

_Detail: ${raw || "unknown error"}_`;
}

export default function AssistantPanel() {
  const { t } = useTranslation('common');
  const [open, setOpen] = createSignal(false);
  const [messages, setMessages] = createSignal([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const readKey = () => { try { return localStorage.getItem(ANTHROPIC_KEY_LS) || ''; } catch (_) { return ''; } };
  const [apiKey, setApiKey] = createSignal(readKey());
  const [showKey, setShowKey] = createSignal(false);
  let messagesEnd, inputEl, keyEl;

  const activeDocName = () => getActiveDocument()?.fileName || null;

  createEffect(() => {
    messages();
    queueMicrotask(() => messagesEnd?.scrollIntoView({ behavior: 'smooth' }));
  });

  function systemPrompt() {
    return 'You are the Spanvision assistant in Spanvision Infra · PDF, a PDF annotation editor. Answer the user in English and help with the open PDF document and general tasks.\n\n' + SKILLS_SYSTEM_PROMPT;
  }

  function saveKey() {
    const v = (keyEl?.value || '').trim();
    try {
      if (v) localStorage.setItem(ANTHROPIC_KEY_LS, v);
      else localStorage.removeItem(ANTHROPIC_KEY_LS);
    } catch (_) { /* private mode — ignore */ }
    setApiKey(v);
    setShowKey(false);
  }

  async function send(explicitText) {
    const text = (typeof explicitText === 'string' ? explicitText : input()).trim();
    if (!text || loading()) return;
    const key = apiKey();

    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    // Claude (Anthropic) direct call — the default when a personal Anthropic key
    // is set via the 🔑 button.
    const claudeDirect = async () => {
      const msgs = messages().slice(1).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, system: systemPrompt(), messages: msgs }),
      });
      if (!res.ok) {
        const tx = await res.text().catch(() => '');
        throw new Error(`Claude API ${res.status}: ${tx.slice(0, 200)}`);
      }
      const data = await res.json();
      return data?.content?.[0]?.text || "No answer received.";
    };

    // MCP relay — an external MCP client (e.g. Claude Code, with working Claude
    // auth) answers via the app's MCP server (app_assistant_pending/answer).
    // Final fallback so the assistant keeps working without a local key.
    const mcpRelay = async () => {
      const history = messages().slice(1)
        .map((m) => `${m.role === 'user' ? "User" : 'Assistent'}: ${m.content}`)
        .join('\n\n');
      const docName = activeDocName();
      const prompt = `${docName ? `Geopend document: ${docName}\n\n` : ''}${history}\n\nAssistent:`;
      return await enqueueAssistantQuestion({ prompt, system: systemPrompt(), docName });
    };

    // Provider order. When a Claude Code/Desktop MCP client is connected (it
    // polled recently), route to the relay FIRST so it answers instantly — no
    // Anthropic API, no key. Otherwise: Claude key -> relay (fallback).
    const relayActive = relayClientActive();
    const providers = [];
    if (relayActive) providers.push(mcpRelay);
    if (key) providers.push(claudeDirect);
    if (!relayActive) providers.push(mcpRelay);

    let answer = null;
    let lastErr = null;
    for (const provider of providers) {
      try { answer = await provider(); break; }
      catch (e) { lastErr = e; console.warn('[assistant] provider faalde, volgende proberen:', e?.message ?? e); }
    }
    setMessages((m) => [...m, { role: 'assistant', content: answer == null ? describeAiError(lastErr) : answer }]);
    setLoading(false);
  }

  // Expose the assistant to the in-app MCP server: an external MCP client can
  // drive it (app_assistant_ask) and act as its AI brain (app_assistant_pending
  // / app_assistant_answer). Registered once when the panel mounts.
  registerAssistantSubmit((text) => { setOpen(true); send(text); });
  registerAssistantMessages(() => messages().map((m) => ({ role: m.role, content: m.content })));

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // Skill set: one-click capabilities. Clicking sends the skill's instruction
  // through the assistant (and thus the relay to the brain), which executes it
  // via MCP tools. 'draw' needs the user to specify what, so it pre-fills.
  function runSkill(skill) {
    if (skill.needsInput) { setInput(skill.invoke); inputEl?.focus(); }
    else send(skill.invoke);
  }

  // Subtitle shows the active provider so the user knows where answers come from.
  const providerLabel = () => (apiKey() ? 'via Claude' : 'Not connected');

  return (
    <Show
      when={open()}
      fallback={
        <button class="chat-fab" title={t('assistantTitle') || 'Spanvision assistant'} onClick={() => setOpen(true)} aria-label="Open Spanvision assistant">✦</button>
      }
    >
      <div class="chat-floating">
        <div class="chat-panel">
          <div class="chat-header">
            <div class="chat-header-titles">
              <span class="chat-title">SV · Spanvision assistant</span>
              <span class="chat-subtitle" title={activeDocName() || ''}>
                {activeDocName() ? `Document: ${activeDocName()} · ${providerLabel()}` : providerLabel()}
              </span>
            </div>
            <button class="chat-close" title="Configure your Anthropic API key" onClick={() => setShowKey(!showKey())} aria-label="Configure assistant connection">⚙</button>
            <button class="chat-close" aria-label="Close assistant" title={t('close') || 'Close'} onClick={() => setOpen(false)}>✕</button>
          </div>

          <Show when={showKey()}>
            <div class="chat-keyrow">
              <input
                ref={keyEl}
                type="password"
                class="chat-keyinput"
                placeholder="Anthropic API key — sk-ant-…"
                value={apiKey()}
                onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); }}
              />
              <button class="chat-keysave" onClick={saveKey}>Save</button>
            </div>
          </Show>

          <div class="chat-messages">
            <For each={messages()}>
              {(msg) => (
                <div class={`chat-message chat-${msg.role}`}>
                  <div class="chat-bubble" innerHTML={renderContent(msg.content)} />
                </div>
              )}
            </For>
            <Show when={loading()}>
              <div class="chat-message chat-assistant"><div class="chat-bubble chat-typing">Thinking…</div></div>
            </Show>
            <div ref={messagesEnd} />
          </div>

          <Show when={!loading()}>
            <div class="chat-chips">
              <For each={ASSISTANT_SKILLS}>
                {(skill) => <button class="chat-chip" title={skill.hint} onClick={() => runSkill(skill)}>{skill.label}</button>}
              </For>
            </div>
          </Show>

          <div class="chat-input-area">
            <textarea
              ref={inputEl}
              class="chat-input"
              value={input()}
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about this PDF…"
              rows={2}
            />
            <button class="chat-send" aria-label="Send message" onClick={send} disabled={loading() || !input().trim()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/></svg></button>
          </div>
        </div>
      </div>
    </Show>
  );
}
