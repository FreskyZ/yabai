import * as mysql from 'mysql';
import { log } from './logger';

// promisify mysql functions

// common query result for non select queries
export interface QueryResult {
    insertId?: number,
    affectedRows?: number,
    changedRows?: number,
}

const myTypeCast: mysql.TypeCast = (field, next) => {  
    if (field.type == 'BIT' && field.length == 1) {
        return field.buffer()[0] == 1;
    }
    return next();
};

export class Database {
    static DateFormat: string = 'YYYY-MM-DD';
    static DateTimeFormat: string = 'YYYY-MM-DD HH:mm:ss';

    private readonly pool: mysql.Pool;
    public constructor(config: mysql.PoolConfig) {
        // you cannot put function in json so this is ok
        config.typeCast = myTypeCast;
        this.pool = mysql.createPool(config);
    }

    public close(): Promise<void> {
        return new Promise(resolve => {
            // document says this will end the connections regardless of
            // whether error happens, so simply log and resolve for error
            this.pool.end(error => {
                if (error) {
                    log.error(`failed to close pool: ${error}`);
                }
                resolve();
            });
        });
    }

    // basic usage
    public async query<T = any>(sql: string, ...params: any[]): Promise<{ fields: mysql.FieldInfo[], value: T }> {
        return await new Promise<{ fields: mysql.FieldInfo[], value: T }>((resolve, reject) => params.length == 0
            ? this.pool.query(sql, (err, value, fields) => err ? reject(err) : resolve({ value, fields }))
            : this.pool.query(sql, params, (err, value, fields) => err ? reject(err) : resolve({ value, fields })));
    }

    // e.g. const [connection, release] = await db.acquire();
    // I thought release is on pool object so explicitly return the release function
    // but actually it is on the connection object, but still keep the return type to see
    // if it is actually better (explicit declare the release variable and let typescript check for unused variable)
    public async acquire(): Promise<[mysql.Connection, () => void]> {
        return new Promise((resolve, reject) => {
            this.pool.getConnection((err, connection) => {
                return err ? reject(err) : resolve([connection, () => connection.release()]);
            })
        })
    }
}
