import * as dayjs from 'dayjs';
import { mylog, setupLog, shutdownLog } from './logger';
import { getLiveStatus, displayPlayURL } from './live-status';
import { setupChatClient } from './chat';

async function setup() {
    await setupLog();

    // 'node index.js' (nothing more) for service
    // 'node index.js info' for display status
    // 'node index.js url' for display url if living, else simply a status
    // 'node index.js chat' for display chat at command line, no archive,
    //    only include DANMU_MSG, SUPER_CHAT_MESSAGE and LIVE_INTERACTIVE_GAME (from my personal preference)
    const args = process.argv[2];

    if (args) {
        const status = await getLiveStatus();
        const startTime = dayjs.unix(status.liveStartTime).format(' YYYY-MM-DD HH:mm:ss');
        console.log(`[${status.realId}][${status.title}]${status.live ? startTime : ' NOT LIVE'}`);
        if (status.live && args == 'url') {
            await displayPlayURL(status.realId);
        }
        if (status.live && args == 'chat') {
            setupChatClient(status.realId);
        } else {
            process.exit(0);
        }
    }

    // setup chat archive service
    // setup live stream archive service

    mylog('yabai start');
    console.log('yabai start');
}
setup();

let shuttingdown = false;
function shutdown() {
    if (shuttingdown) return;
    shuttingdown = true;

    Promise.all([
        // shutdown chat archive service if active
        // shutdown live stream archive service if active
    ]).then(() => {
        mylog('yabai shutdown');
        shutdownLog().then(() => {
            console.log('yabai shutdown');
            process.exit(0);
        });
    }, error => {
        mylog(`yabai shutdown error ${error}`);
        console.log('yabai shutdown error', error);
        process.exit(1);
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
