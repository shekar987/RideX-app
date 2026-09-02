// ─────────────────────────────────────────────
// Driver portal helpers
// ─────────────────────────────────────────────
import { toDateSafe } from '../../../utils/time';
export { getFunctionsBaseUrl } from '../../../utils/net';

// ── Notification chime ────────────────────────────────────────────────────────
// ONE AudioContext for the whole session. Browsers cap concurrent contexts (~6),
// and a context created outside a user gesture starts 'suspended' on mobile —
// so primeAudio() is called from the "Go Online" tap and the same context is
// reused (and resumed) for every chime after that.
let audioCtx = null;

function getAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try { audioCtx = new Ctx(); } catch { audioCtx = null; }
  return audioCtx;
}

/** Call from a user gesture (tap) so later chimes are allowed by autoplay policy. */
export function primeAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/** Play a short three-note chime using the Web Audio API. Never throws. */
export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch (_) {}
}

/** Relative time: "just now" / "5 min ago" / "3h ago" / "12 Mar". Empty for unknown. */
export function formatTime(ts) {
  const d = toDateSafe(ts);
  if (!d) return '';
  const diffMin = Math.floor(Math.max(0, Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "Today 15:45" / "12 Mar 09:10" style. Empty for unknown / pending timestamps. */
export function formatDateTime(ts) {
  const d = toDateSafe(ts);
  if (!d) return '';
  const now     = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${timeStr}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${timeStr}`;
}

/** Truncate long strings with an ellipsis. */
export function trunc(str, n = 30) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s.length > n ? s.slice(0, n) + '…' : s;
}
