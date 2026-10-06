/** Contain keyboard focus while a dialog is open, then restore its trigger. */
export function dialogFocus(node) {
  const previous = document.activeElement;
  const controls = () => [...node.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
    .filter(el => !el.disabled && el.getClientRects().length);
  queueMicrotask(() => controls()[0]?.focus());
  function keydown(event) {
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    const items = controls();
    if (!items.length) { event.preventDefault(); node.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }
  node.addEventListener('keydown', keydown);
  return { destroy() { node.removeEventListener('keydown', keydown); previous?.focus(); } };
}
