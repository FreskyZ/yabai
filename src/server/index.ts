import * as fs from 'fs';
import type { PoolConfig } from 'mysql';
import { Database } from './database';
import { log } from './logger';
import { ChatClient, ChatStorage } from './chat';
import { setupWebInterface, shutdownWebInterface } from './web-interface';

const config: {
    roomId: number,
    database: PoolConfig,
    socketpath: string,
} = JSON.parse(fs.readFileSync('config', 'utf-8'));

const db = new Database(config.database);
const client = new ChatClient(new ChatStorage(db), config.roomId);

Promise.all([
    client.start(),
    setupWebInterface(config.socketpath, db),
]).then(() => {
    log.info('yabai service start');
    console.log('yabai service start');
});

let shuttingdown = false;
function shutdown() {
    if (shuttingdown) return;
    shuttingdown = true;

    setTimeout(() => {
        log.info('yabai service stop timeout, abort');
        console.log('yabai service stop timeout, abort');
        process.exit(1);
    }, 10_000);

    Promise.all([
        client.stop(),
        client.store.close(),
        shutdownWebInterface(),
    ]).then(() => {
        log.info('yabai service stop');
        console.log('yabai service stop');
        process.exit(0);
    }, error => {
        log.error(`yabai service stop with error ${error}`);
        console.log('yabai service stop with error', error);
        process.exit(1);
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
