import * as fs from 'fs';
import * as chalk from 'chalk';
import { logInfo, logCritical, watchvar } from '../common';
import { admin } from '../tools/admin';
import { eslint } from '../tools/eslint';
import { Asset, upload } from '../tools/ssh';
import { SassOptions, SassResult, sass } from '../tools/sass';
import { TypeScriptOptions, TypeScriptResult, MyJSXRuntime, typescript } from '../tools/typescript';

// build player page, which is a single page web page without backend, 
// and kind of similar to fine's targets/static, have hand written html
//    and one sass file which transpiles into one compressed css,
//    and one ts file which transpiles into look-like-hand-written javascript
// build results are all copied to webroot/static/xxapi

const getTypeScriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'jsx-page',
    entry: `src/player/index.tsx`,
    sourceMap: 'no',
    watch,
});
const sassOptions: SassOptions = {
    entry: `src/player/index.sass`,
};
const getUploadAsset = (result: TypeScriptResult | SassResult | 'html'): Asset => result == 'html' ? {
    remote: `static/xxapi/player.html`,
    data: Buffer.from(fs.readFileSync(`src/player/index.html`)),
} : 'files' in result ? {
    remote: `static/xxapi/player.js`,
    data: Buffer.from(result.files[0].content),
} : {
    remote: `static/xxapi/player.css`,
    data: result.resultCss,
};

function setupjsx(result: TypeScriptResult) {
    const content = result.files[0].content;

    const match = /import (?<pat>{[\w\s,]+}) from 'react';/.exec(content); // pat: deconstruction pattern // rust call this syntax node pattern, js world seems using other name but I don't know
    const importreact = match ? `const ${match.groups['pat']} = React;` : ''; // this match is expected to be sucess

    let mycode = content.slice(content.indexOf('\n') + 1); //content.slice(content.indexOf('\n', content.indexOf('\n', content.indexOf('\n') + 1) + 1) + 1); // my content starts from line 3
    mycode = mycode.replaceAll(/_jsxs?\(_Fragment, /g, 'myjsxf(').replaceAll(/_jsxs?/g, 'myjsx'); // replace _jsxs? to myjsx, because a lot of underscore reduce readability

    result.files[0].content = importreact + MyJSXRuntime + '\n' + mycode; // put import react and jsx runtime in one line and then mycode
}

async function buildOnce(): Promise<void> {
    logInfo('akr', chalk`{cyan player}`);
    const assets: Asset[] = [getUploadAsset('html')]; // html is here

    await eslint(`player`, 'browser', 'src/player/index.tsx');
    const checkResult = typescript(getTypeScriptOptions(false)).check();
    if (!checkResult.success) {
        return logCritical('akr', chalk`{cyan player} failed at check`);
    }
    setupjsx(checkResult);
    assets.push(getUploadAsset(checkResult));

    const transpileResult = await sass(sassOptions).transpile();
    if (!transpileResult.success) {
        return logCritical('akr', chalk`{cyan player} failed at transpile`);
    }
    assets.push(getUploadAsset(transpileResult));

    const uploadResult = await upload(assets);
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
        admin.core({ type: 'content', sub: { type: 'reload-static', key: 'xxapi' } });
    }, { interval: 2021 });

    typescript(getTypeScriptOptions(true)).watch(async checkResult => {
        setupjsx(checkResult);
        // tsc does not print watched message because in backend targets it will be directly followed by a mypack 'repack' message, so add one here
        logInfo('tsc', `completed with no diagnostics`);
        if (await upload(getUploadAsset(checkResult))) { requestReload(); }
    });

    sass(sassOptions).watch(async transpileResult => {
        if (await upload(getUploadAsset(transpileResult))) { requestReload(); }
    });

    const requestReupload = watchvar(async () => {
        logInfo('htm', 'reupload');
        if (await upload(getUploadAsset('html'))) { requestReload(); }
    }, { interval: 2021, initialCall: true });

    const htmlEntry = `src/player/index.html`;
    logInfo('htm', chalk`watch {yellow ${htmlEntry}}`);
    fs.watch(htmlEntry, { persistent: false }, requestReupload);
}

export function build(watch: boolean): void {
    (watch ? buildWatch : buildOnce)();
}
