import * as fs from 'fs/promises';
import * as path from 'path';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';

// logging, basic usage:
//     import { log } from './logger';
//     log("some message");
//     log(some error);
// log files in approot/log, name YYYYMMDD.log, preserve 1 week

// because initialize require utc, while index do not use dayjs, so put it here
dayjs.extend(utc);
// logs are in logs directory, there is no meaning to configure it
const logsDirectory = path.resolve('logs');

// current log's time, use to check day switch and open new log file
let time = dayjs.utc();
// log file handle
let handle: fs.FileHandle = null;

const flushIfCount = 11;
// in seconds
const flushIfTimeout = 600;
let notFlushCount: number = 0;
// only active when have not flush count
let notFlushTimeout: NodeJS.Timeout = null;

const reserveDays = 7;

async function init() {
    await fs.mkdir('logs', { recursive: true });
    if (handle) {
        handle.close();
    }
    handle = await fs.open(path.join(logsDirectory, `${time.format('YYYYMMDD')}.log`), 'a');
}
async function flush() {
    notFlushCount = 0;
    await handle.sync();

    if (notFlushTimeout) {
        // clear timeout incase this flush is triggered by write
        // does not setup new timeout because now not flush count is 0
        clearTimeout(notFlushTimeout);
        notFlushTimeout = null;
    }
    if (!time.isSame(dayjs.utc(), 'date')) {
        time = dayjs.utc();
        await setupLog(); // do not repeat init file handle
        notFlushTimeout = null;
    }
}
async function cleanup() {
    for (const filename of await fs.readdir(logsDirectory)) {
        const date = dayjs.utc(path.basename(filename).slice(0, 8), 'YYYYMMDD');
        if (date.isValid() && date.add(reserveDays, 'day').isBefore(dayjs.utc(), 'date')) {
            try {
                await fs.unlink(path.resolve(logsDirectory, filename));
            } catch {
                // ignore
            }
        }
    }
}
async function write(content: string) {
    handle.write(`[${dayjs.utc().format('HH:mm:ss')}] ${content}\n`);
    if (notFlushCount + 1 > flushIfCount) {
        flush();
    } else {
        notFlushCount += 1;
        if (notFlushCount == 1) {
            notFlushTimeout = setTimeout(() => flush(), flushIfTimeout * 1000);
        }
    }
}

export const setupLog = init;
export const mylog = write; // log is too short, use mylog
export const shutdownLog = flush;

// try cleanup outdated logs per hour
// attention: do not promise all them, that's meaningless, just fire and forget
setInterval(cleanup, 3600_000).unref();

// log and abort for all uncaught exceptions and unhandled rejections
process.on('uncaughtException', async error => {
    console.log('uncaught exception', error);
    try {
        await write(`uncaught exception: ${error.message}`);
    } catch {
        // nothing, this happens when logger initialize have error
    }
    process.exit(103);
});
process.on('unhandledRejection', async reason => {
    console.log('unhandled rejection', reason);
    try {
        await write(`unhandled rejection: ${reason}`);
    } catch {
        // nothing, this happens when logger initialize have error
    }
    process.exit(104);
});
