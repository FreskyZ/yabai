import * as fs from 'fs';
import * as chalk from 'chalk';
import { config } from '../config';
import { logInfo, logCritical, watchvar } from '../common';
import { admin } from '../tools/admin';
import { eslint } from '../tools/eslint';
import { codegen } from '../tools/codegen';
import { Asset, upload } from '../tools/ssh';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

// builder button page, similar to player page for now

const htmlEntry = 'src/button/index.html';
const getTypeScriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/button/index.ts`,
    additionalLib: ['dom'],
    sourceMap: 'no', // 'normal',
    watch,
});
const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    files,
    entry: '/vbuild/index.js',
    minify: true,
});

const getHTMLUploadAsset = (content: string): Asset => ({
    remote: 'static/xxapi/button.html',
    data: Buffer.from(content),
});
const getJSUploadAsset = (result: MyPackResult): Asset => ({
    remote: 'static/xxapi/button.js',
    data: Buffer.from(result.resultJs),
});

async function buildOnce(): Promise<void> {
    logInfo('akr', chalk`{cyan button}`);
    await eslint(`button`, 'browser', 'src/button/index.tsx');

    // task1: html template
    const p1 = (async () => {
        const content = await fs.promises.readFile(htmlEntry, 'utf-8');
        return getHTMLUploadAsset(content.replace('<dev-script-placeholder />', ''));
    })();

    // task3: codegen, check and pack
    const p3 = (async () => {
        const generateResult = await codegen('client').generate();
        if (!generateResult.success) {
            return logCritical('akr', chalk`{cyan button} failed at codegen`);
        }
        // const checkResult = typescript(getTypeScriptOptions(false)).check();
        // if (!checkResult.success) {
        //     return logCritical('akr', chalk`{cyan button} failed at check`);
        // }
        // const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
        // if (!packResult.success) {
        //     return logCritical('akr', chalk`{cyan button} failed at pack`);
        // }
        const packResult = {
            resultJs: await fs.promises.readFile('src/button/index.ts'),
        } as MyPackResult;
        return getJSUploadAsset(packResult);
    })();

    const uploadResult = await upload(await Promise.all([p1, p3]));
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan button} failed at upload`);
    }
    const adminResult = await admin.core({ type: 'content', sub: { type: 'reload-static', key: 'xxapi' } });
    if (!adminResult) {
        return logCritical('akr', chalk`{cyan button} failed at reload`);
    }

    logInfo('akr', chalk`{cyan button} completed succesfully`);
}

function buildWatch() {
    logInfo('akr', chalk`watch {cyan button}`);

    let jsHasChange = false;
    const requestReload = watchvar(() => {
        const thisTimeJSHasChange = jsHasChange;
        jsHasChange = false;
        admin.core({ type: 'content', sub: { type: 'reload-static', key: 'xxapi' } })
            .then(() => admin.devpage(thisTimeJSHasChange ? 'reload-all' : 'reload-css'));
    }, { interval: 2021 });

    codegen('client').watch();

    typescript(getTypeScriptOptions(true)).watch(async checkResult => {
        // tsc does not print watched message because in backend targets it will be directly followed by a mypack 'repack' message, so add one here
        logInfo('tsc', `completed with no diagnostics`);
        const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
        if (packResult.success) {
            if (await upload(getJSUploadAsset(packResult))) {
                jsHasChange = true;
                requestReload();
            }
        }
    });

    const requestReupload = watchvar(async () => {
        logInfo('htm', 'reupload');
        const content = await fs.promises.readFile(htmlEntry, 'utf-8');
        const scripttag = `<script type="text/javascript" src="https://${config.domain}:${await admin.port}/client-dev.js"></script>`;
        if (await upload(getHTMLUploadAsset(content.replace('<dev-script-placeholder />', scripttag)))) {
            jsHasChange = true;
            requestReload();
        }
    }, { interval: 2021, initialCall: true });
    logInfo('htm', chalk`watch {yellow ${htmlEntry}}`);
    fs.watch(htmlEntry, { persistent: false }, requestReupload);
}

export function build(watch: boolean): void {
    (watch ? buildWatch : buildOnce)();
}
