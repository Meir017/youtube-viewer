import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { createLogger, type Logger, type LogLevel } from '../../generator/logger.ts';

describe('createLogger', () => {
    let logSpy: ReturnType<typeof spyOn>;
    let warnSpy: ReturnType<typeof spyOn>;
    let errorSpy: ReturnType<typeof spyOn>;
    const originalLogLevel = process.env.LOG_LEVEL;

    beforeEach(() => {
        logSpy = spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = spyOn(console, 'error').mockImplementation(() => {});
        delete process.env.LOG_LEVEL;
    });

    afterEach(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
        if (originalLogLevel !== undefined) {
            process.env.LOG_LEVEL = originalLogLevel;
        } else {
            delete process.env.LOG_LEVEL;
        }
    });

    test('returns a logger with debug, info, warn, error methods', () => {
        const log = createLogger('server');
        expect(typeof log.debug).toBe('function');
        expect(typeof log.info).toBe('function');
        expect(typeof log.warn).toBe('function');
        expect(typeof log.error).toBe('function');
    });

    test('info messages include category in output', () => {
        const log = createLogger('channel');
        log.info('Processing @GitHub');
        expect(logSpy).toHaveBeenCalledTimes(1);
        const output = logSpy.mock.calls[0][0] as string;
        expect(output).toContain('[channel]');
        expect(output).toContain('Processing @GitHub');
    });

    test('uses correct emoji for known categories', () => {
        const log = createLogger('server');
        log.info('starting');
        const output = logSpy.mock.calls[0][0] as string;
        expect(output).toContain('🚀');
    });

    test('uses fallback emoji for unknown categories', () => {
        const log = createLogger('unknown-category');
        log.info('test');
        const output = logSpy.mock.calls[0][0] as string;
        expect(output).toContain('📎');
        expect(output).toContain('[unknown-category]');
    });

    test('error calls console.error', () => {
        const log = createLogger('store');
        log.error('disk failure');
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const output = errorSpy.mock.calls[0][0] as string;
        expect(output).toContain('[store]');
        expect(output).toContain('disk failure');
    });

    test('warn calls console.warn', () => {
        const log = createLogger('enrichment');
        log.warn('rate limited');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const output = warnSpy.mock.calls[0][0] as string;
        expect(output).toContain('[enrichment]');
    });

    test('info and debug call console.log', () => {
        process.env.LOG_LEVEL = 'debug';
        const log = createLogger('cache');
        log.debug('verbose detail');
        log.info('normal message');
        expect(logSpy).toHaveBeenCalledTimes(2);
    });

    test('passes extra args to console', () => {
        const log = createLogger('server');
        const err = new Error('test');
        log.error('API error:', err);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0][1]).toBe(err);
    });

    describe('LOG_LEVEL filtering', () => {
        test('default level (info) suppresses debug', () => {
            const log = createLogger('cache');
            log.debug('should be hidden');
            expect(logSpy).not.toHaveBeenCalled();
        });

        test('default level (info) allows info, warn, error', () => {
            const log = createLogger('server');
            log.info('visible');
            log.warn('visible');
            log.error('visible');
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        test('LOG_LEVEL=debug shows all levels', () => {
            process.env.LOG_LEVEL = 'debug';
            const log = createLogger('cache');
            log.debug('visible');
            log.info('visible');
            log.warn('visible');
            log.error('visible');
            expect(logSpy).toHaveBeenCalledTimes(2);
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        test('LOG_LEVEL=warn suppresses debug and info', () => {
            process.env.LOG_LEVEL = 'warn';
            const log = createLogger('enrichment');
            log.debug('hidden');
            log.info('hidden');
            log.warn('visible');
            log.error('visible');
            expect(logSpy).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        test('LOG_LEVEL=error suppresses everything except errors', () => {
            process.env.LOG_LEVEL = 'error';
            const log = createLogger('channel');
            log.debug('hidden');
            log.info('hidden');
            log.warn('hidden');
            log.error('visible');
            expect(logSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        test('invalid LOG_LEVEL falls back to info', () => {
            process.env.LOG_LEVEL = 'invalid';
            const log = createLogger('server');
            log.debug('hidden');
            log.info('visible');
            expect(logSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('category emojis', () => {
        const cases: Array<[string, string]> = [
            ['server', '🚀'],
            ['channel', '📺'],
            ['enrichment', '📝'],
            ['cache', '💾'],
            ['store', '🗄️'],
            ['image', '🖼️'],
            ['insights', '🧠'],
        ];

        for (const [category, emoji] of cases) {
            test(`${category} → ${emoji}`, () => {
                const log = createLogger(category);
                log.info('test');
                const output = (category === 'server' || category === 'channel' || category === 'enrichment' ||
                    category === 'cache' || category === 'store' || category === 'image' || category === 'insights')
                    ? logSpy.mock.calls[0][0] as string : '';
                expect(output).toContain(emoji);
            });
        }
    });
});
