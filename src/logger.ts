import * as fs from 'fs';
import * as path from 'path';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';

// logging for archive service, usage:
//    import { log } from './logger';
//    log.info("some message");
//    log.error(some error);
//    log.message(event); // message log is only enabled by environment variable
//
// this is copied from wacq/logger, change from async to sync because async seems meaningless
// because I always block on setup, and write can use non promise async api, and async shutdown make things complicated

// because initialize require utc, while index do not use dayjs, so put it here
dayjs.extend(utc);
// logs are in logs directory, there is no meaning to configure it
const logsDirectory = path.resolve('logs');

interface LoggerOptions {
    readonly postfix: string, // file name postfix
    readonly flushByCount: number,
    readonly flushByInterval: number, // in second, flush when this logger is idle and has something to flush
    readonly reserveDays: number,
}

class Logger {
    private time: dayjs.Dayjs = dayjs.utc();
    private handle: number = 0;
    private notFlushCount: number = 0;
    // not null only when have not flush count
    private notFlushTimeout: NodeJS.Timeout = null;

    constructor(private readonly options: LoggerOptions) {}

    init() {
        fs.mkdirSync('logs', { recursive: true });
        this.handle = fs.openSync(path.join(logsDirectory,
            `${this.time.format('YYYYMMDD')}${this.options.postfix}.log`), 'a');
    }

    deinit() {
        if (this.handle) {
            fs.fsyncSync(this.handle);
            if (this.notFlushTimeout) {
                clearTimeout(this.notFlushTimeout);
            }
            fs.closeSync(this.handle);
        }
    }

    flush() {
        // no if this.handle: according to flush strategy,
        // this function will not be called with this.handle == 0

        this.notFlushCount = 0;
        fs.fsyncSync(this.handle);

        if (this.notFlushTimeout) {
            // clear timeout incase this flush is triggered by write
            // does not setup new timeout because now not flush count is 0
            clearTimeout(this.notFlushTimeout);
            this.notFlushTimeout = null;
        }
        if (!this.time.isSame(dayjs.utc(), 'date')) {
            this.time = dayjs.utc();
            fs.closeSync(this.handle);
            this.init(); // do not repeat init file handle
            this.notFlushCount = null;
        }
    }

    cleanup() {
        for (const filename of fs.readdirSync(logsDirectory)) {
            const date = dayjs.utc(path.basename(filename).slice(0, 8), 'YYYYMMDD');
            if (date.isValid() && date.add(this.options.reserveDays, 'day').isBefore(dayjs.utc(), 'date')) {
                try {
                    fs.unlinkSync(path.resolve(logsDirectory, filename));
                } catch {
                    // ignore
                }
            }
        }
    }

    write(content: string) {
        if (!this.handle) {
            this.init();
        }
        fs.writeSync(this.handle, `[${dayjs.utc().format('HH:mm:ss')}] ${content}\n`);
        if (this.notFlushCount + 1 > this.options.flushByCount) {
            this.flush();
        } else {
            this.notFlushCount += 1;
            if (this.notFlushCount == 1) {
                this.notFlushTimeout = setTimeout(() => this.flush(), this.options.flushByInterval * 1000);
            }
        }
    }
}

type Level = 'info' | 'error' | 'debug';
const levels: Record<Level, LoggerOptions> = {
    // normal log
    info: { postfix: 'I', flushByCount: 11, flushByInterval: 600, reserveDays: 7 },
    // error log, flush immediately, in that case, flush by interval is not used
    error: { postfix: 'E', flushByCount: 0, flushByInterval: 0, reserveDays: 7 },
    // debug log, raw message and transformed message, is written frequently, so flush by count is kind of large
    debug: { postfix: 'D', flushByCount: 101, flushByInterval: 600, reserveDays: 7 },
};

// @ts-ignore ts does not understand object.entries, actually it does not understand reduce<>(..., {}), too
const loggers: Record<Level, Logger> =
    Object.fromEntries(Object.entries(levels).map(([level, options]) => [level, new Logger(options)]));

// @ts-ignore again
export const log: Record<Level, (content: string) => void> = Object.fromEntries(Object.entries(loggers)
    .map(([level, logger]) => [level, level == 'debug' && !('YABAI_DEBUG' in process.env) ? (() => {}) : logger.write.bind(logger)]));

// try cleanup outdated logs per hour
setInterval(() => Object.entries(loggers).map(([_, logger]) => logger.cleanup()), 3600_000).unref();

// this flush log is more proper
process.on('exit', () => {
    Object.entries(loggers).map(([_, logger]) => logger.deinit());
});
// log and abort for all uncaught exceptions and unhandled rejections
process.on('uncaughtException', async error => {
    console.log('uncaught exception', error);
    try {
        await log.error(`uncaught exception: ${error.message}`);
    } catch {
        // nothing, this happens when logger initialize have error
    }
    process.exit(103);
});
process.on('unhandledRejection', async reason => {
    console.log('unhandled rejection', reason);
    try {
        await log.error(`unhandled rejection: ${reason}`);
    } catch {
        // nothing, this happens when logger initialize have error
    }
    process.exit(104);
});
