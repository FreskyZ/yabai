import * as fs from 'fs/promises';
import * as chalk from 'chalk';
import { config } from '../config';
import { logInfo, logCritical } from '../common';
import { admin } from '../tools/admin';
import { upload } from '../tools/ssh';

async function buildOnce(): Promise<void> {
    logInfo('akr', chalk`{cyan home}`);
    if (!await upload({
        remote: 'static/xxapi/index.html',
        data: await fs.readFile('src/home/index.html'),
    }, { basedir: config.webroot })) {
        return logCritical('akr', chalk`{cyan home} failed at upload`);
    }
    const adminResult = await admin.core({ type: 'content', sub: { type: 'reload-static', key: 'xxapi' } });
    if (!adminResult) {
        return logCritical('akr', chalk`{cyan home} failed at reload`);
    }
    logInfo('akr', chalk`{cyan home} completed succesfully`);
}

export function build() {
    buildOnce();
}
