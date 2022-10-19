import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as chalk from 'chalk';
import * as dayjs from 'dayjs';
import * as filesize from 'filesize';
import * as memfs from 'memfs';
import * as TerserPlugin from 'terser-webpack-plugin';
import * as unionfs from 'unionfs';
import * as webpack from 'webpack';
import { logInfo, logError, logCritical, watchvar } from '../common';
import { config } from '../config';
import { admin } from '../tools/admin';
import { eslint } from '../tools/eslint';
import { codegen } from '../tools/codegen';
import { Asset as /* compare to webpack asset */ MyAsset, upload } from '../tools/ssh';
import { SassOptions, sass } from '../tools/sass';
import { TypeScriptOptions, TypeScriptResult, typescript } from '../tools/typescript';

const getTypeScriptOptions = (watch: boolean): TypeScriptOptions => ({
    base: 'jsx-app',
    entry: `src/player/index.tsx`,
    sourceMap: 'normal',
    watch,
});
const getSassOptions = (): SassOptions => ({
    entry: `src/player/index.sass`,
});
const getUploadJsAssets = (additional: AdditionalStat): MyAsset[] => Object.entries(additional.assets).map((asset) => ({
    data: asset[1].data,
    remote: `static/${config.appname}/${asset[0]}`,
}));

// AKARIN_APP_CLIENT_OSIZE: size optimize level
// 0 is not minify, 1 is fast minify, 2 is full minify, default to 2
const sizeOptimizeLevelKey = 'AKARIN_APP_CLIENT_OSIZE';
const sizeOptimizeLevel = sizeOptimizeLevelKey in process.env ? (process.env[sizeOptimizeLevelKey] === '0' ? 0 : parseInt(process.env[sizeOptimizeLevelKey]!) || 2) : 2;
const getWebpackConfiguration = (): webpack.Configuration => ({
    mode: 'development', // production force disable cache, so use development mode with production optimization settings
    entry: { 'index': path.resolve('src', 'player', 'index.js') },
    module: { rules: [{ test: /\.js$/, exclude: /node_modules/, enforce: 'pre', use: ['source-map-loader'] }] },
    resolve: { symlinks: false }, // or else webpack will use realpath not symlink path
    output: { filename: 'player.js', path: '/vbuild', pathinfo: false },
    devtool: false, // use SourceMapDevToolPlugin instead of this
    cache: { type: 'filesystem', name: `webpack-akari-${config.appname}`, cacheDirectory: path.resolve('.cache') },
    performance: { hints: false }, // entry point size issue is handled by cache control and initial loading placeholder not your warning
    optimization: {
        moduleIds: 'deterministic', chunkIds: 'deterministic', mangleExports: 'deterministic',
        innerGraph: true, usedExports: true, emitOnErrors: false, flagIncludedChunks: true, concatenateModules: true,
        nodeEnv: 'production',
        splitChunks: {
            hidePathInfo: true,
            cacheGroups: {
                // NOTE: they are manually balanced for "min max size", rebalance them if they lost balance
                /* eslint-disable prefer-named-capture-group */ // test only, no reason to have capture group name
                '1': { test: /node_modules\/react-dom/, priority: 20, chunks: 'all', filename: 'client-vendor1.js' },
                '2': { test: /node_modules\/(rc|@ant-design)/, priority: 20, chunks: 'all', filename: 'client-vendor2.js' },
                '3': { test: /node_modules\/(antd|lodash)/, priority: 20, chunks: 'all', filename: 'client-vendor3.js' },
                '4': { test: /node_modules/, priority: 10, chunks: 'all', filename: 'client-vendor4.js' },
                /* eslint-enable prefer-named-capture-group */
            },
        },
        minimize: sizeOptimizeLevel != 0,
        minimizer: [new TerserPlugin({ terserOptions: {
            format: { comments: false },
            compress: sizeOptimizeLevel == 2,
        }, extractComments: false })],
    },
    plugins: [
        // ATTENTION:
        // 1. antd-dayjs-webpack-plugin does not compatible with
        //    current webpack version (5.68) where loader-utils is deprecated and completely removed
        //    it should be simply adding and entry with file content node_modules/antd-dayjs-webpack-plugin/src/init-loader.js
        //    and resolve all import moment to dayjs module directory, but this no parameter constructor call actually did not do that
        // 2. so I assume my code currently does not need this plugin,
        //    BUT does not correctly replaces moment as dayjs in antd source file bundled content
        // 3. comment this out to make webpack pass bundle, bundle size seems increases, check later
        // new AntdDayjsWebpackPlugin(),
        new webpack.SourceMapDevToolPlugin({
            // NOTE: this plugin or the devtool option is about whether or how to put source map not whether generate source map when packing and minimizing
            // so the test/include/exclude is applied on asset name not module/chunk name
            exclude: /vendor/,
            filename: '[name].js.map',
        }),
    ],
    // infrastructureLogging: { debug: 'webpack.cache.PackFileCacheStrategy', level: 'verbose' },
});

interface WebpackResult {
    error?: Error,
    statsObject?: webpack.Stats,
}
interface AdditionalStat {
    assets: { [assetName: string]: { data: Buffer, compressSize: number } },
}

// watching only for display
function createWebpackCompiler(inputfs: any, watching: boolean, additionalHeader?: string): [webpack.Compiler, AdditionalStat] {
    logInfo(`wpk${additionalHeader}`, chalk`${watching ? 'watch' : 'once'} {yellow src/player/index.js}`);

    const compiler = webpack(getWebpackConfiguration());
    const additional: AdditionalStat = { assets: {} };

    // their type is very mismatch but they very can work at runtime
    compiler.inputFileSystem = (new unionfs.Union() as any).use(fs).use(inputfs);
    compiler.outputFileSystem = memfs.createFsFromVolume(new memfs.Volume()) as any; // means `> /dev/null`

    // asset source is available when emitting and discarded sometime before compile callback, so compress size calculation should be here
    // put it in compilation custom property
    compiler.hooks.emit.tap('CompressSizePlugin', compilation => {
        for (const asset of compilation.getAssets()) {
            // ATTENTION: SourceMapDevToolPluginOptions.filename does not work completely, temp fix here
            // also TerserPlugin.terserOptions.sourcemap does not work completely, too
            const filename = asset.name == 'index.js.map' ? 'player.js.map' : asset.name;
            // clone incase webpack is able to discard internal value
            const filecontent = Buffer.from(asset.source.buffer().toString('utf-8').replace('index.js.map', 'player.js.map'));
            additional.assets[filename] = {
                data: filecontent,
                compressSize: zlib.brotliCompressSync(asset.source.buffer()).length,
            };
        }
    });

    return [compiler, additional];
}

// for normal, print warning message and asset summary and all other things to file
// for error, only print all things to file
function printWebpackResult(stats: webpack.StatsCompilation, additional: AdditionalStat, additionalHeader?: string) {
    additionalHeader = additionalHeader ?? '';
    const reportFileName = `/tmp/akari-stats-${dayjs().format('YYYYMMDD-HHmmss')}.txt`;

    const getCompressSize = (a: string) => additional.assets[a]?.compressSize ?? 0;
    const totalAssetSize = filesize(stats.assets.reduce<number>((acc, a) => acc + a.size, 0));
    const totalCompressSize = filesize(stats.assets.reduce<number>((acc, a) => acc + getCompressSize(a.name), 0) || 0);
    const maxVendorSize = stats.assets.filter(a => a.name.includes('vendor')).reduce<number>((acc, a) => Math.max(acc, getCompressSize(a.name)), 0);

    if (stats.errorsCount == 0) {
        logInfo(`wpk${additionalHeader}`, chalk`completed with {yellow ${stats.assets.length}} assets in ${stats.time/1000}s, `
            + chalk`{yellow ${totalCompressSize}} ({${maxVendorSize > 300_000 ? 'red' : 'white'} max ${filesize(maxVendorSize || 0)}})`);
        if (stats.warningsCount > 0) {
            logInfo(`wpk${additionalHeader}`, chalk`{yellow ${stats.warningsCount}} warnings`);
            for (const { message } of stats.warnings) {
                console.log('  ' + message);
            }
        }
    } else {
        logError(`wpk${additionalHeader}`, chalk`completed with {red ${stats.errorsCount}} errors, stat file {yellow ${reportFileName}}`);
        for (const { message } of stats.errors) {
            logError(`wpk${additionalHeader}`, message);
        }
    }

    let report = '';
    const chunkFlags = ['entry', 'rendered', 'initial', 'recorded'];
    const moduleFlags = ['built', 'codeGenerated', 'cached', 'cacheable', 'optional', 'prefetched'];

    report += `hash ${stats.hash} time ${stats.time}ms total size ${totalAssetSize} (${totalCompressSize})\n`;
    if (stats.warningsCount) {
        report += `${stats.warningsCount} warnings:\n`;
        for (const warning of stats.warnings) {
            report += JSON.stringify(warning, undefined, 1) + '\n';
        }
    }
    if (stats.errorsCount) {
        report += `${stats.errorsCount} errors:\n`;
        for (const error of stats.errors) {
            report += JSON.stringify(error, undefined, 1) + '\n';
        }
    }
    for (const asset of stats.assets) {
        report += `asset ${asset.name} size ${filesize(asset.size)} compress ${(filesize(getCompressSize(asset.name)))} chunks [${asset.chunks.join(',')}] chunkNames [${asset.chunkNames.join(',')}]\n`;
    }
    for (const chunk of stats.chunks) {
        report += `chunk ${chunk.id} files [${chunk.files.join(',')}] size ${filesize(chunk.size)} flags [${chunkFlags.filter(name => (chunk as any)[name]).join(',')}] ${chunk.modules.length} chunks\n`;
        for (const $module of chunk.modules) {
            report += `  module ${$module.id} size ${filesize($module.size)} flags [${moduleFlags.filter(name => ($module as any)[name]).join(',')}] name "${$module.name}" identifier "${$module.identifier}"\n`;
            if (/\+ \d+ modules/.test($module.name) && $module.modules) { // concated modules
                for (const submodule of $module.modules) {
                    report += `    submodule ${submodule.name} size ${filesize(submodule.size)}\n`;
                }
            }
        }
    }

    fs.writeFileSync(reportFileName, report);
    // no human will want to read the file, even vscode don't want to syntatic parse or even lexical parse this file
    // fs.writeFileSync('stats.full.json', JSON.stringify(stats, undefined, 1));
}

// see TypeScriptChecker.watch, cleanup unused modules
function cleanupMemoryFile(stats: webpack.StatsCompilation, files: TypeScriptResult['files'], mfs: memfs.IFs) {
    // this is used js file absolute path, the files parameter contains js/map file absolute path
    const mycodeModules: string[] = [];
    const mycodePrefix = path.resolve('src');
    for (const $module of stats.modules) {
        if (/\+ \d+ modules/.test($module.name) && $module.modules) {
            for (const submodule of $module.modules) {
                const fullpath = path.resolve(submodule.name);
                if (fullpath.startsWith(mycodePrefix)) {
                    mycodeModules.push(fullpath);
                }
            }
        } else {
            const fullpath = path.resolve($module.name);
            if (fullpath.startsWith(mycodePrefix)) {
                mycodeModules.push(fullpath);
            }
        }
    }

    const unusedFiles = files.filter(f => !mycodeModules.includes(f.name) && !mycodeModules.some(m => m + '.map' == f.name));
    for (const unusedFile of unusedFiles) {
        files.splice(files.indexOf(unusedFile), 1);
        mfs.unlinkSync(unusedFile.name);
        if (!unusedFile.name.endsWith('.map')) {
            console.log(chalk`   {gray - ${unusedFile.name}}`);
        }
    }
}

// watching only means less info
async function renderHtmlTemplate(files: [js: string[], css: string[]], watching: boolean, additionalHeader?: string): Promise<MyAsset> {
    const templateEntry = `src/player/index.html`;
    if (!watching) {
        logInfo(`htm${additionalHeader ?? ''}`, chalk`read {yellow ${templateEntry}}`);
    }

    const jsFiles = files[0].map(jsFile => '/' + jsFile).concat(!watching ? [] : [`https://${config.domain}:${await admin.port}/client-dev.js`]);

    const htmlTemplate = await fs.promises.readFile(templateEntry, 'utf-8');
    const html = htmlTemplate
        .replace('<script-placeholder />', jsFiles.map(jsFile => `<script type="text/javascript" src="${jsFile}"></script>`).join('\n  '))
        .replace('<stylesheet-placeholder />', files[1].map(cssFile => `<link rel="stylesheet" type="text/css" href="/${cssFile}">`).join('\n  '));

    logInfo(`htm${additionalHeader ?? ''}`, 'template rendered');
    return { remote: `static/${config.appname}/player.html`, data: Buffer.from(html) };
}

async function buildOnce(): Promise<void> {
    logInfo('akr', chalk`{cyan client}`);
    await eslint(`client`, 'browser', [`src/player/**/*.ts`, `src/player/**/*.tsx`]);

    // promise 1: fcg -> tsc -> wpk, return js file list
    // note that returned list are both for ssh upload and html render, so source map is included so should be excluded from render html
    const p1 = (async (): Promise<MyAsset[]> => {
        const generator = codegen('client');
        const generateResult = await generator.generate();
        if (!generateResult.success) {
            return logCritical('akr', chalk`{cyan client} failed at codegen`);
        }

        const checkResult = typescript(getTypeScriptOptions(false)).check();
        if (!checkResult.success) {
            return logCritical('akr', chalk`{cyan client} failed at check`);
        }

        // their type is very mismatch but they very can work at runtime
        const ifs = memfs.Volume.fromJSON(checkResult.files.reduce<Record<string, string>>((acc, f) => { acc[f.name] = f.content; return acc; }, {}));
        const [compiler, additional] = createWebpackCompiler(ifs, false, '');
        const packResult = await new Promise<WebpackResult>(resolve => compiler.run((error, statsObject) => resolve({ error, statsObject })));
        if (packResult.error) {
            logError('wpk', JSON.stringify(packResult.error, undefined, 1));
            return logCritical('akr', chalk`{yellow client} failed at pack (1)`);
        }
        const stats = packResult.statsObject!.toJson() // as unknown as WebpackStat;

        printWebpackResult(stats, additional, '');
        if (stats.errorsCount > 0) {
            return logCritical('akr', chalk`{cyan client} failed at pack (2)`);
        }

        // ATTENTION: this is essential for persist cache because this triggers cached items to actually write to file
        // // the relationship between them is not described clearly in their own document
        compiler.close(error => { if (error) { logError('wpk', `failed to close compiler`, error); } }); // print error and ignore
        return getUploadJsAssets(additional);
    })();

    // promise 2: css, return css file list
    const p2 = (async (): Promise<MyAsset[]> => {
        const transpileResult = await sass(getSassOptions()).transpile();
        if (!transpileResult.success) {
            return logCritical('akr', chalk`{cyan client} failed at transpile`);
        }
        return [{ remote: `static/${config.appname}/player.css`, data: transpileResult.resultCss }];
    })();

    const results = await Promise.all([p1, p2]);
    const html = await renderHtmlTemplate([
        results[0].map(r => path.basename(r.remote)).filter(n => n.endsWith('.js')),
        results[1].map(r => path.basename(r.remote))], false);

    const uploadResult = await upload(results[0].concat(results[1]).concat([html]), { filenames: false });
    if (!uploadResult) {
        return logCritical('akr', chalk`{cyan client} failed at upload`);
    }
    const adminResult = await admin.core({ type: 'content', sub: { type: 'reload-static', key: config.appname } });
    if (!adminResult) {
        return logCritical('akr', chalk`{cyan client} failed at reload`);
    }

    logInfo('akr', chalk`{cyan client} complete successfully`);
}

function buildWatch(additionalHeader?: string) {
    additionalHeader = additionalHeader ?? '';
    logInfo(`akr${additionalHeader}`, chalk`watch {cyan client}`);
    // mkdir(recursive)

    let [jsAssets, cssAssets]: [MyAsset[], MyAsset[]] = [[], []]; // assign new array in consider of the remove file issue
    let jsHasChange = false; // js has change, if render is trigger by css, then only send reload-css, else send reload-js // this is kind of duplicate with webpackLastHash, design later
    const requestRender = watchvar(async () => {
        const thisRenderJsHasChange = jsHasChange; // in case flag changed during some operations
        jsHasChange = false;

        const html = await renderHtmlTemplate([
            jsAssets.map(r => path.basename(r.remote)).filter(n => n.endsWith('.js')),
            cssAssets.map(r => path.basename(r.remote))], true, additionalHeader);

        if (jsAssets.length > 0) {
            if (await upload(jsAssets.concat(cssAssets).concat([html]), { filenames: false, additionalHeader })) {
                await admin.core({ type: 'content', sub: { type: 'reload-static', key: config.appname } }, additionalHeader);
                await admin.devpage(thisRenderJsHasChange ? 'reload-js' : 'reload-css', additionalHeader);
            }
        }
    });

    const generator = codegen('client', additionalHeader);
    generator.watch(); // no callback watch is this simple

    const mfs = new memfs.Volume();
    const [compiler, additional] = createWebpackCompiler(mfs, true, additionalHeader);

    // Attention: this is *the* array inside TypeScriptChecker.watch, to be clean up by webpack result
    let typescriptResultFiles: TypeScriptResult['files'] = [];
    let webpackLastHash: string | null = null;
    typescript(getTypeScriptOptions(true), additionalHeader).watch(async ({ files }) => {
        // no need to delete file here because it will not happen in typescript write file hook while correct delete file happen in cleanupMemoryFile
        for (const { name: fileName, content: fileContent } of files) {
            if (!mfs.existsSync(fileName) && !fileName.endsWith('.map')) {
                console.log(chalk`   + ${fileName}`);
            }
            await mfs.promises.mkdir(path.dirname(fileName), { recursive: true });
            await mfs.promises.writeFile(fileName, fileContent);
        }
        typescriptResultFiles = files;

        // use compiler.run instead of compiler.watch because
        // webpack seems to be very unstable watching input memory file system
        // and output message order is a mess and I cannot figure out what happens
        if (compiler.running) {
            logError(`wpk${additionalHeader}`, 'already repacking, discard');
            return;
        }
        logInfo(`wpk${additionalHeader}`, 'repack');
        compiler.run((error, statsObject) => {
            if (error) {
                logError(`wpk${additionalHeader}`, 'webpack fatal error', error);
                return;
            }
            const stats = statsObject!.toJson();

            printWebpackResult(stats, additional, additionalHeader);
            cleanupMemoryFile(stats, typescriptResultFiles, mfs as memfs.IFs); // this writer still cannot write his type clearly, again

            if (stats.errorsCount != 0) { return; }

            if (stats.hash != webpackLastHash) {
                webpackLastHash = stats.hash;
                jsAssets = getUploadJsAssets(additional);
                jsHasChange = true;
                requestRender();
            } else {
                logInfo(`wpk${additionalHeader}`, chalk`completed with {gray no change}`);
            }

            // see buildOnce compiler.close
            compiler.close(error => { if (error) { logError('wpk', `failed to close compiler`, error); } }); // print error and ignore
        });
    });

    sass(getSassOptions(), additionalHeader).watch(transpileResult => {
        cssAssets = [{ remote: `static/${config.appname}/index.css`, data: transpileResult.resultCss }];
        requestRender();
    });
}

export function build(watch: boolean, additionalHeader?: string): void {
    (watch ? buildWatch : buildOnce)(additionalHeader);
}
