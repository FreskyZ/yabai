import * as fs from 'fs/promises';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { config } from '../config';
import { eslint } from '../tools/eslint';
import { codegen } from '../tools/codegen';
import { Asset, upload } from '../tools/ssh';
import { typescript, TypeScriptOptions } from '../tools/typescript';
import { mypack, MyPackOptions, MyPackResult } from '../tools/mypack';

const getTypeScriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'normal',
    entry: `src/server/index.ts`,
    sourceMap: 'hide',
    watch,
});
const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    files: files,
    entry: `/vbuild/server/index.js`,
    sourceMap: true,
    minify: true,
});
const getUploadAssets = (packResult: MyPackResult): Asset[] => [
    { remote: `index.js`, data: packResult.resultJs },
    { remote: `index.js.map`, data: packResult.resultMap! },
];

export async function uploadConfig(): Promise<void> {
    await upload({ remote: 'config', data: await fs.readFile('src/shared/config.json') }, { basedir: config.approot });
}

async function buildOnce(): Promise<void> {
    logInfo('akr', chalk`{cyan server}`);
    await eslint(`server`, 'node', [`src/server/*.ts`]);

    const codegenResult = await codegen('server').generate();
    if (!codegenResult.success) {
        return logCritical('akr', chalk`{cyan server} failed at code generation`);
    }
    const checkResult = typescript(getTypeScriptOptions(false)).check();
    if (!checkResult.success) {
        logCritical('akr', chalk`{cyan server} failed at check`);
    }
    const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
    if (!packResult.success) {
        logCritical('akr', chalk`{cyan server} failed at pack`);
    }
    const uploadResult = await upload(getUploadAssets(packResult), { basedir: config.approot });
    if (!uploadResult) {
        logCritical('akr', chalk`{cyan server} failed at upload`);
    }

    logInfo('akr', chalk`{cyan server} completed successfully`);
}

function buildWatch(additionalHeader?: string) {
    logInfo(`akr${additionalHeader ?? ''}`, chalk`watch {cyan server}`);

    codegen('server', additionalHeader).watch(); // no callback watch is this simple

    const packer = mypack(getMyPackOptions([]), additionalHeader);
    typescript(getTypeScriptOptions(true), additionalHeader).watch(async ({ files }) => {
        packer.updateFiles(files);
        const packResult = await packer.run();
        if (packResult.success && packResult.hasChange) {
            await upload(getUploadAssets(packResult), { basedir: config.approot, additionalHeader });
        }
    });
}

export function build(watch: boolean): void {
    (watch ? buildWatch : buildOnce)();
}
