/**
 * Tiny throttled progress reporter for CLI tools.
 *
 * - In a TTY it rewrites a single line with `\r` so progress updates in place.
 * - When not attached to a TTY (CI, redirected output), it prints periodic
 *   newline-terminated lines so logs stay readable.
 * - Updates are throttled so tight hot loops don't pay any I/O cost per tick.
 * - `done()` clears the in-progress line and emits one final summary line so
 *   subsequent output isn't tangled with a stale progress line.
 */

export interface ProgressOptions {
    /** Total units of work if known (enables percent + ETA). */
    total?: number;
    /** Minimum ms between visible updates. Default: 250. */
    throttleMs?: number;
    /** Where to write. Default: process.stdout. */
    stream?: NodeJS.WriteStream;
}

export interface Progress {
    /** Report absolute progress (not a delta). Throttled. Safe to call often. */
    tick(current: number, extra?: string): void;
    /** Emit final line and release the terminal line. */
    done(finalMessage?: string): void;
}

const ESC_CLEAR_LINE = '\x1b[2K\r';

export function createProgress(label: string, options: ProgressOptions = {}): Progress {
    const stream = options.stream ?? process.stdout;
    const throttleMs = options.throttleMs ?? 250;
    const total = options.total;
    const isTTY = Boolean((stream as NodeJS.WriteStream).isTTY);
    const start = Date.now();
    let lastRender = 0;
    let lastCurrent = 0;
    let finished = false;

    function format(current: number, extra?: string): string {
        const elapsedMs = Date.now() - start;
        const elapsedS = Math.max(elapsedMs / 1000, 0.001);
        const rate = current / elapsedS;
        const rateStr = rate >= 1000
            ? `${(rate / 1000).toFixed(1)}K/s`
            : `${rate.toFixed(0)}/s`;

        const parts: string[] = [];
        parts.push(label);
        if (total && total > 0) {
            const pct = Math.min(100, (current / total) * 100).toFixed(1);
            parts.push(`${current.toLocaleString()}/${total.toLocaleString()} (${pct}%)`);
            if (current > 0 && current < total) {
                const etaS = Math.max(0, (total - current) / Math.max(rate, 1));
                parts.push(`ETA ${formatSeconds(etaS)}`);
            }
        } else {
            parts.push(current.toLocaleString());
        }
        parts.push(rateStr);
        parts.push(formatSeconds(elapsedS));
        if (extra) parts.push(extra);
        return parts.join(' · ');
    }

    function render(current: number, extra?: string): void {
        const line = format(current, extra);
        if (isTTY) {
            stream.write(`${ESC_CLEAR_LINE}${line}`);
        } else {
            stream.write(`${line}\n`);
        }
    }

    return {
        tick(current: number, extra?: string): void {
            if (finished) return;
            lastCurrent = current;
            const now = Date.now();
            if (now - lastRender < throttleMs) return;
            lastRender = now;
            render(current, extra);
        },

        done(finalMessage?: string): void {
            if (finished) return;
            finished = true;
            const msg = finalMessage ?? format(lastCurrent);
            if (isTTY) {
                stream.write(`${ESC_CLEAR_LINE}${msg}\n`);
            } else {
                stream.write(`${msg}\n`);
            }
        },
    };
}

function formatSeconds(s: number): string {
    if (!Number.isFinite(s)) return '–';
    if (s < 1) return `${Math.round(s * 1000)}ms`;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rem = Math.round(s - m * 60);
    return `${m}m${rem.toString().padStart(2, '0')}s`;
}
