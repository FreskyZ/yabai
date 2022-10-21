import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical, watchvar } from '../common';
import { admin } from '../tools/admin';
import { eslint } from '../tools/eslint';
import { codegen } from '../tools/codegen';
import { Asset, upload } from '../tools/ssh';
import { SassOptions, SassResult, sass } from '../tools/sass';
import { TypeScriptOptions, typescript } from '../tools/typescript';
import { MyPackOptions, MyPackResult, mypack } from '../tools/mypack';

// build player page
//
// player page is kind of simple because it only mainly contains
// one video element and several text elements and very few interactive logics,
// if include react, it relies on several libraries (at least dayjs and hlsjs) and is
// at the threshold to use wacq/script/targets/client-style webpack based builder,
// *BUT*, the few interactive logics, for comments area, involves drag move, drag resize
// and scrollbar manipulation, and any of them is not suitable at all to be directly put
// in react's state to be used fluencely without using many complex hooks or many complex
// lifetime functions (class components), so this builder comes back partially to 
// fine/targets/static-style builder with additional mypack invocation with a few tweaks.

const htmlEntry = 'src/player/index.html';
const sassOptions: SassOptions = {
    entry: `src/player/index.sass`,
};
const getTypeScriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/player/index.ts`,
    additionalLib: ['dom'],
    sourceMap: 'no',
    watch,
});
const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    files,
    entry: '/vbuild/player/index.js',
    minify: true,
    externals: {
        'dayjs': 'dayjs',
        // this is amazing place for this amazing workaround that
        // hls ecma module need import default but the cdn package can directly use the Hls variable
        'hls.js': '{ default: Hls }',
        'pako': 'pako',
    },
});

const getHTMLUploadAsset = (data: Buffer): Asset => ({
    remote: 'static/xxapi/player.html',
    data,
});
const getCssUploadAsset = (result: SassResult): Asset => ({
    remote: 'static/xxapi/player.css',
    data: result.resultCss,
});
const getJSUploadAsset = (result: MyPackResult): Asset => ({
    remote: 'static/xxapi/player.js',
    data: Buffer.from(result.resultJs),
});

async function buildOnce(): Promise<void> {
    logInfo('akr', chalk`{cyan player}`);
    await eslint(`player`, 'browser', 'src/player/index.tsx');

    // task1: read html file
    const p1 = (async () => {
        return getHTMLUploadAsset(await fs.promises.readFile(htmlEntry));
    })();
    // task2: transpile sass
    const p2 = (async () => {
        const transpileResult = await sass(sassOptions).transpile();
        if (!transpileResult.success) {
            return logCritical('akr', chalk`{cyan player} failed at transpile`);
        }
        return getCssUploadAsset(transpileResult);
    })();
    // task3: codegen, check and pack
    const p3 = (async () => {
        const generateResult = await codegen('client').generate();
        if (!generateResult.success) {
            return logCritical('akr', chalk`{cyan player} failed at codegen`);
        }
        const checkResult = typescript(getTypeScriptOptions(false)).check();
        if (!checkResult.success) {
            return logCritical('akr', chalk`{cyan player} failed at check`);
        }
        const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
        if (!packResult.success) {
            return logCritical('akr', chalk`{cyan player} failed at pack`);
        }
        return getJSUploadAsset(packResult);
    })();

    const uploadResult = await upload(await Promise.all([p1, p2, p3]));
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan player} failed at upload`);
    }
    const adminResult = await admin.core({ type: 'content', sub: { type: 'reload-static', key: 'xxapi' } });
    if (!adminResult) {
        return logCritical('akr', chalk`{cyan player} failed at reload`);
    }

    logInfo('akr', chalk`{cyan player} completed succesfully`);
}

function buildWatch() {
    logInfo('akr', chalk`watch {cyan player}`);

    const requestReload = watchvar(() => {
        admin.core({ type: 'content', sub: { type: 'reload-static', key: 'xxapi' } })
    }, { interval: 2021 });

    codegen('client').watch();

    typescript(getTypeScriptOptions(true)).watch(async checkResult => {
        // tsc does not print watched message because in backend targets it will be directly followed by a mypack 'repack' message, so add one here
        logInfo('tsc', `completed with no diagnostics`);
        const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
        if (packResult.success) {
            if (await upload(getJSUploadAsset(packResult))) {
                requestReload();
            }
        }
    });

    sass(sassOptions).watch(async transpileResult => {
        if (await upload(getCssUploadAsset(transpileResult))) {
            requestReload();
        }
    });

    const requestReupload = watchvar(async () => {
        logInfo('htm', 'reupload');
        if (await upload(getHTMLUploadAsset(await fs.promises.readFile(htmlEntry)))) {
            requestReload();
        }
    }, { interval: 2021, initialCall: true });
    logInfo('htm', chalk`watch {yellow ${htmlEntry}}`);
    fs.watch(htmlEntry, { persistent: false }, requestReupload);
}

export function build(watch: boolean): void {
    (watch ? buildWatch : buildOnce)();
}
