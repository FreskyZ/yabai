import * as mysql from 'mysql';
import { mylog } from './logger';
import fetch from 'node-fetch';

// this includes my common database,
// // adk says include this to prevent copy everywhere, but I do copy now ()

// I'm really single push, so this is fixed not configured
export const ROOM_ID = 92613;

let pool: mysql.Pool;
export function setupDatabaseConnection(config: mysql.PoolConfig) {
    pool = mysql.createPool({
        ...config,
        typeCast: (field, next) => {
            if (field.type == 'BIT' && field.length == 1) {
                return field.buffer()[0] == 1;
            }
            return next();
        },
    });
}

export const QueryDateTimeFormat = {
    datetime: 'YYYY-MM-DD HH:mm:ss',
    date: 'YYYY-MM-DD',
};

// query result except array of data
export interface QueryResult {
    insertId?: number,
    affectedRows?: number,
    changedRows?: number,
}

// promisify
export async function query<T = any>(sql: string, ...params: any[]): Promise<{ fields: mysql.FieldInfo[], value: T }> {
    return await new Promise<{ fields: mysql.FieldInfo[], value: T }>((resolve, reject) => params.length == 0
        ? pool.query(sql, (err, value, fields) => err ? reject(err) : resolve({ value, fields }))
        : pool.query(sql, params, (err, value, fields) => err ? reject(err) : resolve({ value, fields })));
}

// fetch and parse json
export async function myfetch<T = any>(action_name: string, url: string): Promise<T> {
    const response = await fetch(url);
    if (response.status != 200) {
        mylog(`${action_name} failed, response ${response.status} ${response.statusText}`);
        return null;
    }
    try {
        return await response.json();
    } catch (error) {
        mylog(`${action_name} failed, cannot parse body, ${error}`);
        return null;
    }
}
