/**
 * notify.ts — non-blocking notification helper. Uses the ToastHost that
 * mounts near the app root. Falls back to alert() if the ToastHost hasn't
 * mounted yet (edge case; first paint of an error).
 */
import { pushToast, type ToastActie } from "../components/feedback/Toast";

/** Toon "binnenkort beschikbaar" voor een feature die nog niet werkt. */
export function comingSoon(label: string, note?: string): void {
  try {
    pushToast({
      kind: "soon",
      title: `${label} — coming soon`,
      body: note ?? "This feature is planned for a future release.",
      duration: 5500,
    });
  } catch {
    alert(`${label} is not available in v2 yet.\n\n${note ?? ""}`);
  }
}

/** Eenvoudige info-notificatie. */
export function notifyInfo(title: string, body?: string): void {
  try {
    pushToast({ kind: "info", title, body });
  } catch {
    alert(body ? `${title}\n\n${body}` : title);
  }
}

/** Succes-notificatie (groen). */
export function notifySuccess(title: string, body?: string): void {
  try {
    pushToast({ kind: "success", title, body });
  } catch {
    alert(body ? `${title}\n\n${body}` : title);
  }
}

/**
 * Waarschuwing (amber). Met `actie` krijgt de melding een knop — zet dan ook
 * een langere `duur` (ms), zodat de gebruiker tijd heeft om te lezen en te
 * kiezen.
 */
export function notifyWarning(
  title: string,
  body?: string,
  opties?: { actie?: ToastActie; duur?: number },
): void {
  try {
    pushToast({ kind: "warning", title, body, actie: opties?.actie, duration: opties?.duur });
  } catch {
    alert(body ? `${title}\n\n${body}` : title);
  }
}
