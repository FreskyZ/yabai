import * as fs from 'fs/promises';
import * as chalk from 'chalk';
import { logInfo, logCritical } from '../common';
import { config } from '../config';
import { upload } from '../tools/ssh';
import { typescript, TypeScriptOptions } from '../tools/typescript';
import { mypack, MyPackOptions } from '../tools/mypack';

const typescriptOptions: TypeScriptOptions = {
    base: 'normal',
    entry: `src/server/index.ts`,
    // local does not need source map,
    // server targets does not have complex error handling and does not use source map
    sourceMap: 'no',
    watch: false,
};

const getMyPackOptions = (files: MyPackOptions['files']): MyPackOptions => ({
    type: 'app',
    files: files,
    entry: `/vbuild/index.js`, 
    minify: true,
});

export async function uploadConfig(): Promise<void> {
    await upload({
        remote: 'config',
        data: await fs.readFile('src/config.json'),
    }, { basedir: config.approot });
}

export async function build() {
    logInfo('akr', chalk`{cyan server}`);

    const checkResult = typescript(typescriptOptions).check();
    if (!checkResult.success) {
        logCritical('akr', chalk`{cyan server} failed at check`);
    }
    const packResult = await mypack(getMyPackOptions(checkResult.files)).run();
    if (!packResult.success) {
        logCritical('akr', chalk`{cyan server} failed at pack`);
    }
    const uploadResult = await upload([{ remote: `index.js`, data: packResult.resultJs }], { basedir: config.approot });
    if (!uploadResult) {
        logCritical('akr', chalk`{cyan server} failed at upload`);
    }

    logInfo('akr', chalk`{cyan server} completed successfully`);
}
