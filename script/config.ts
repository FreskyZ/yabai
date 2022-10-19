import * as fs from 'fs';

// config: not to be tracked environment related items
// 
// files
// - akaric: a json config file beside akari (local) executable, not tracked by version control,
//   some of the items are directly text replaced by tools/typescript when reading source file,
//   so that they does not need these items at runtime
// - src/core/config.json, a json config file which will be deployed beside core module executable (approot/config)
//   will be used by core module at runtime
// 
// items
// - appname (in akaric): this application's name,
//   should be same as name in 'apps'
//   should be same as app's static directory name (webroot/static/:app),
//   should be ok to be used as reload-static's key,
// - domain (in akaric): the ssh host and api service location (api.domain.com),
//   used in all targets and many documents, will be replaced by tools/typescript
// - origin (in akaric): app's origin, should be same as origin in 'apps'
// - webroot (in akaric): the web root absolute path, used in all targets, will be replaced by tools/typescript
// - codebook (in akaric): ?, used in akari (local)
// - ssh (in akaric): { user, identity, passphrase } only used in akari (local)
// - codebook (in src/core/config): ?, used in akari (server)
// - ssl (in src/core/config): { key: cert, fullchain }, used in core module and akari (server) for https
// - database (in src/core/config): mysql.PoolConfig, used in core module,
//   note that for app servers, as standalone services, have different database connection setting
//   (database is not same) and may include other config items in their own config file
// - approot (in akaric): application root for deploy backend build result
// - socketpath (in akaric): app's unix domain socket path to communicate with core process
// - roomId (in akaric): TODO

interface Config {
    appname: string,
    domain: string,
    webroot: string,
    approot: string,
    codebook: string,
    ssh: { user: string, identity: string, passphrase: string },
    // tools/typescript rely on this
    apps: { name: string, origin: string, socket: string }[],
}
export const config = JSON.parse(fs.readFileSync('akaric', 'utf-8')) as Config;
