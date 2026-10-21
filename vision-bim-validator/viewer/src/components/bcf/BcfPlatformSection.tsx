/**
 * BcfPlatformSection — BCF Platform auth, project selection, and push.
 */

import { useState } from "react";
import { useStore } from "../../store";

export function BcfPlatformSection() {
  const bcfAuth = useStore((s) => s.bcfAuth);
  const bcfPhase = useStore((s) => s.bcfPhase);
  const bcfPlatformUrl = useStore((s) => s.bcfPlatformUrl);
  const bcfProjects = useStore((s) => s.bcfProjects);
  const bcfSelectedProjectId = useStore((s) => s.bcfSelectedProjectId);
  const bcfPushProgress = useStore((s) => s.bcfPushProgress);
  const bcfPushResult = useStore((s) => s.bcfPushResult);
  const bcfError = useStore((s) => s.bcfError);
  const bcfIssues = useStore((s) => s.bcfIssues);
  const bcfLogout = useStore((s) => s.bcfLogout);
  const bcfRefreshProjects = useStore((s) => s.bcfRefreshProjects);
  const bcfSelectProject = useStore((s) => s.bcfSelectProject);
  const bcfPushIssues = useStore((s) => s.bcfPushIssues);
  const bcfResetPush = useStore((s) => s.bcfResetPush);

  const isAuthenticated = bcfAuth.method !== "none";
  const queuedIssues = bcfIssues.filter((i) => i.pushState === "queued");

  // Phase: pushing
  if (bcfPhase === "pushing" && bcfPushProgress) {
    const done = bcfPushProgress.completed + bcfPushProgress.failed;
    const pct = bcfPushProgress.total > 0 ? Math.round((done / bcfPushProgress.total) * 100) : 0;

    return (
      <div className="bcf-panel__section">
        <h4 className="bcf-panel__heading">Sending to platform...</h4>
        <div className="bcf-panel__progress">
          <div className="bcf-panel__progress-bar">
            <div className="bcf-panel__progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="bcf-panel__progress-text">
            {done} / {bcfPushProgress.total} topics ({pct}%)
          </div>
          {bcfPushProgress.currentTopic && (
            <div className="bcf-panel__progress-topic">
              {bcfPushProgress.currentTopic}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Phase: done
  if (bcfPhase === "done" && bcfPushResult) {
    return (
      <div className="bcf-panel__section">
        <h4 className="bcf-panel__heading">Result</h4>
        <div className="bcf-panel__result">
          <div className="bcf-panel__result-stat bcf-panel__result-stat--success">
            <span>Topics created</span>
            <strong>{bcfPushResult.topicsCreated}</strong>
          </div>
          {bcfPushResult.topicsFailed > 0 && (
            <div className="bcf-panel__result-stat bcf-panel__result-stat--error">
              <span>Failed</span>
              <strong>{bcfPushResult.topicsFailed}</strong>
            </div>
          )}
        </div>
        {bcfPushResult.errors.length > 0 && (
          <div className="bcf-panel__result-errors">
            {bcfPushResult.errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
        {bcfPlatformUrl && (
          <a
            className="bcf-panel__link"
            href={`${bcfPlatformUrl}/projects/${bcfPushResult.projectId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View project on platform →
          </a>
        )}
        <button
          type="button"
          className="bcf-panel__btn bcf-panel__btn--secondary"
          onClick={bcfResetPush}
        >
          Back
        </button>
      </div>
    );
  }

  // Not authenticated — show login options
  if (!isAuthenticated) {
    return <AuthSection />;
  }

  // Authenticated — show project selector + push
  return (
    <div className="bcf-panel__section">
      <h4 className="bcf-panel__heading">BCF Platform</h4>

      <div className="bcf-panel__status bcf-panel__status--connected">
        <span className="bcf-panel__status-dot" />
        {bcfAuth.user
          ? `Ingelogd als ${bcfAuth.user.name}`
          : "Connected with API key"}
      </div>

      {/* Project selector */}
      <div className="bcf-panel__field">
        <label className="bcf-panel__label">Project</label>
        <div className="bcf-panel__btn-row">
          <select
            className="bcf-panel__select"
            value={bcfSelectedProjectId ?? ""}
            onChange={(e) => bcfSelectProject(e.target.value || null)}
            style={{ flex: 1 }}
          >
            <option value="">Select project...</option>
            {bcfProjects.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="bcf-panel__btn bcf-panel__btn--secondary"
            onClick={bcfRefreshProjects}
            title="Refresh projects"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Create project inline */}
      <CreateProjectForm onCreated={() => bcfRefreshProjects()} />

      {/* Push button */}
      {queuedIssues.length > 0 && (
        <button
          type="button"
          className="bcf-panel__btn bcf-panel__btn--primary"
          disabled={!bcfSelectedProjectId || queuedIssues.length === 0}
          onClick={() => bcfPushIssues()}
          style={{ width: "100%", marginTop: "var(--spacing-sm)" }}
        >
          Push {queuedIssues.length} issue{queuedIssues.length !== 1 ? "s" : ""} to platform
        </button>
      )}

      {bcfSelectedProjectId && bcfPlatformUrl && (
        <a
          className="bcf-panel__link"
          href={`${bcfPlatformUrl}/projects/${bcfSelectedProjectId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open project on platform →
        </a>
      )}

      {bcfError && (
        <div className="bcf-panel__status bcf-panel__status--error">
          <span className="bcf-panel__status-dot" />
          {bcfError}
        </div>
      )}

      <button
        type="button"
        className="bcf-panel__btn bcf-panel__btn--danger"
        onClick={bcfLogout}
        style={{ marginTop: "var(--spacing-sm)" }}
      >
        {bcfAuth.method === "oidc" ? "Sign out" : "Disconnect"}
      </button>
    </div>
  );
}

// ── Auth Section (not logged in) ─────────────────────────

function AuthSection() {
  const bcfOidcAvailable = useStore((s) => s.bcfOidcAvailable);
  const bcfLoginOidc = useStore((s) => s.bcfLoginOidc);
  const bcfConnectApiKey = useStore((s) => s.bcfConnectApiKey);
  const bcfPhase = useStore((s) => s.bcfPhase);
  const bcfError = useStore((s) => s.bcfError);
  const bcfPlatformUrl = useStore((s) => s.bcfPlatformUrl);
  const bcfSetPlatformUrl = useStore((s) => s.bcfSetPlatformUrl);

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyUrl, setApiKeyUrl] = useState(bcfPlatformUrl || "");
  const [apiKey, setApiKey] = useState("");

  const isConnecting = bcfPhase === "connecting";

  const handleApiKeyConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyUrl.trim() && apiKey.trim()) {
      void bcfConnectApiKey(apiKeyUrl.trim(), apiKey.trim());
    }
  };

  return (
    <div className="bcf-panel__section">
      <h4 className="bcf-panel__heading">BCF Platform</h4>
      <p className="bcf-panel__progress-text">
        Connect to the Spanvision BCF Platform to save and share issues.
      </p>

      {/* Platform URL (shared for both auth methods) */}
      <div className="bcf-panel__field">
        <label className="bcf-panel__label">Platform URL</label>
        <input
          className="bcf-panel__input"
          type="url"
          placeholder="https://your-bcf-platform.example"
          value={apiKeyUrl}
          onChange={(e) => {
            setApiKeyUrl(e.target.value);
            bcfSetPlatformUrl(e.target.value);
          }}
          disabled={isConnecting}
        />
      </div>

      {/* OIDC login */}
      {bcfOidcAvailable && (
        <button
          type="button"
          className="bcf-panel__btn bcf-panel__btn--primary"
          onClick={bcfLoginOidc}
          disabled={isConnecting}
          style={{ width: "100%" }}
        >
          Sign in with organization SSO
        </button>
      )}

      {/* API key fallback */}
      {!showApiKey ? (
        <button
          type="button"
          className="bcf-panel__btn bcf-panel__btn--secondary"
          onClick={() => setShowApiKey(true)}
          style={{ width: "100%", marginTop: "var(--spacing-xs)" }}
        >
          {bcfOidcAvailable ? "Or use an API key" : "Connect with API key"}
        </button>
      ) : (
        <form onSubmit={handleApiKeyConnect} style={{ marginTop: "var(--spacing-xs)" }}>
          <div className="bcf-panel__field">
            <label className="bcf-panel__label">API Key</label>
            <input
              className="bcf-panel__input"
              type="password"
              placeholder="bcfk_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isConnecting}
            />
          </div>
          <button
            type="submit"
            className="bcf-panel__btn bcf-panel__btn--primary"
            disabled={!apiKeyUrl.trim() || !apiKey.trim() || isConnecting}
            style={{ width: "100%" }}
          >
            {isConnecting ? (
              <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
                <span className="bcf-panel__spinner" />
                Verbinden...
              </span>
            ) : (
              "Verbinden"
            )}
          </button>
        </form>
      )}

      {bcfError && (
        <div className="bcf-panel__status bcf-panel__status--error" style={{ marginTop: "var(--spacing-sm)" }}>
          <span className="bcf-panel__status-dot" />
          {bcfError}
        </div>
      )}
    </div>
  );
}

// ── Create Project Form ──────────────────────────────────

function CreateProjectForm({ onCreated }: { onCreated: () => void }) {
  const bcfCreateProject = useStore((s) => s.bcfCreateProject);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    const project = await bcfCreateProject({
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setCreating(false);

    if (project) {
      setName("");
      setDescription("");
      setShowForm(false);
      onCreated();
    }
  };

  if (!showForm) {
    return (
      <button
        type="button"
        className="bcf-panel__btn bcf-panel__btn--secondary"
        onClick={() => setShowForm(true)}
        style={{ width: "100%", marginTop: "var(--spacing-xs)" }}
      >
        + Create new project
      </button>
    );
  }

  return (
    <form className="bcf-create-project" onSubmit={handleCreate}>
      <div className="bcf-panel__field">
        <label className="bcf-panel__label">Project Name</label>
        <input
          className="bcf-panel__input"
          type="text"
          placeholder="Mijn BIM project"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={creating}
          autoFocus
        />
      </div>
      <div className="bcf-panel__field">
        <label className="bcf-panel__label">Description (optional)</label>
        <input
          className="bcf-panel__input"
          type="text"
          placeholder="IDS validation results"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={creating}
        />
      </div>
      <div className="bcf-panel__btn-row">
        <button
          type="submit"
          className="bcf-panel__btn bcf-panel__btn--primary"
          disabled={!name.trim() || creating}
          style={{ flex: 1 }}
        >
          {creating ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          className="bcf-panel__btn bcf-panel__btn--secondary"
          onClick={() => setShowForm(false)}
          disabled={creating}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
