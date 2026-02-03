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
