// ANSI color codes for terminal output
export const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    bgBlue: '\x1b[44m',
};

export const log = {
    info: (msg: string) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
    success: (msg: string) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    warn: (msg: string) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
    error: (msg: string) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    fetch: (msg: string) => console.log(`${colors.blue}🌐 ${msg}${colors.reset}`),
    parse: (msg: string) => console.log(`${colors.magenta}🔍 ${msg}${colors.reset}`),
    video: (msg: string) => console.log(`${colors.white}🎬 ${msg}${colors.reset}`),
    header: (msg: string) => console.log(`\n${colors.bright}${colors.bgBlue} ${msg} ${colors.reset}\n`),
    detail: (label: string, value: string) => console.log(`   ${colors.dim}${label}:${colors.reset} ${value}`),
};

// ── Structured, category-aware logger ────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const CATEGORY_EMOJIS: Record<string, string> = {
    server: '🚀',
    channel: '📺',
    enrichment: '📝',
    cache: '💾',
    store: '🗄️',
    image: '🖼️',
    insights: '🧠',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
    debug: colors.dim,
    info: colors.cyan,
    warn: colors.yellow,
    error: colors.red,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
    debug: '🔍 DEBUG',
    info: 'ℹ️  INFO ',
    warn: '⚠️  WARN ',
    error: '❌ ERROR',
};

function getMinLevel(): LogLevel {
    const env = process.env.LOG_LEVEL?.toLowerCase();
    if (env && env in LOG_LEVEL_ORDER) return env as LogLevel;
    return 'info';
}

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[getMinLevel()];
}

export interface Logger {
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
}

/**
 * Create a category-scoped logger with level filtering.
 *
 * ```ts
 * const log = createLogger('channel');
 * log.info('Processing @GitHub');
 * // => 📺 ℹ️  INFO  [channel] Processing @GitHub
 * ```
 *
 * Set `LOG_LEVEL` env var to filter output (debug | info | warn | error).
 */
export function createLogger(category: string): Logger {
    const emoji = CATEGORY_EMOJIS[category] ?? '📎';

    function emit(level: LogLevel, msg: string, args: unknown[]): void {
        if (!shouldLog(level)) return;
        const color = LEVEL_COLORS[level];
        const label = LEVEL_LABELS[level];
        const prefix = `${emoji} ${color}${label}${colors.reset} ${colors.dim}[${category}]${colors.reset}`;
        const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        if (args.length > 0) {
            consoleFn(`${prefix} ${msg}`, ...args);
        } else {
            consoleFn(`${prefix} ${msg}`);
        }
    }

    return {
        debug: (msg: string, ...args: unknown[]) => emit('debug', msg, args),
        info: (msg: string, ...args: unknown[]) => emit('info', msg, args),
        warn: (msg: string, ...args: unknown[]) => emit('warn', msg, args),
        error: (msg: string, ...args: unknown[]) => emit('error', msg, args),
    };
}
