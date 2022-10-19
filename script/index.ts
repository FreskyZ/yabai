import * as readline from 'readline';
import { admin } from './tools/admin';
import { build as buildSelf, hashself } from './targets/self';
import { build as buildServer, uploadConfig } from './targets/server';

process.on('unhandledRejection', error => {
    console.log('unhandled reject: ', error);
    process.exit(0);
});

function calladmin(result: Promise<boolean>) {
    result.then(result => process.exit(result ? 0 : 1));
}

function dispatch(args: string) {
    /**/ if (args == 'self') { buildSelf(); }

    else if (args == 'server') { buildServer(); }
    // else if (args == 'core') { buildServer(false); }
    // else if (args == 'both') { buildClient(false, 'c'); buildServer(false, 's'); }
    // else if (args == 'watch ui') { buildClient(true); }
    // else if (args == 'watch core') { buildServer(true); }
    // else if (args == 'watch both') { buildClient(true, 'c'); buildServer(true, 's'); }

    // content
    else if (/^reload-static [\w\\\.]+$/.test(args)) { calladmin(admin.core({ type: 'content', sub: { type: 'reload-static', key: args.slice(14) } })) }
    else if (args == 'disable-source-map') { calladmin(admin.core({ type: 'content', sub: { type: 'disable-source-map' } })) }
    else if (args == 'enable-source-map') { calladmin(admin.core({ type: 'content', sub: { type: 'enable-source-map' } })) }

    // upload config
    else if (args == 'config') { uploadConfig(); }

    else { console.log('unknown command'); process.exit(1); }
}

const args = [process.argv[2], process.argv[3]].filter(a => a).join(' '); // 0 is node, 1 is akari

hashself().then(h => {
    if (!args.startsWith('self') && h != "selfhash") {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('script source code may be changed after last bootstrap, continue? (y|n): ', answer => {
            if (answer != 'y' && answer != 'Y') {
                process.exit(2);
            } else {
                dispatch(args);
            }
        });
    } else {
        dispatch(args);
    }
});
