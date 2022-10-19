// import * as dayjs from 'dayjs';
import { Database } from './database';
import { setupAPIServer, shutdownAPIServer } from '../adk/api-server'
import { dispatch as dispatchImpl } from "../api/server";
import type * as api from '../api/types';
import { log } from './logger';

// web interface implementations, currently they fit in one file

// this borrows ChatStorage.db, no need to finalize
let db: Database;

async function getLiveInfo(_roomId: number): Promise<api.LiveInfo> {
    return {} as any;
}
async function getPlayInfo(_realId: number): Promise<api.PlayInfo[]> {
    return [];
}

async function getArchives(_year: number, _month: number): Promise<api.Archive[]> {
    if ('SOMETHINGNOTEXIST' in process.env) {
        db.query("something");
    }
    return [{ startTime: 42, endTime: 43, titles: ['shaonianpi de zhibojian'], danmuCount: 12450 }];
}
// async function getArchive(identifier: string): Promise<Buffer>

function handleError(kind: string, error: any) {
    log.error(`${kind}: ${error}`);
}

export function setupWebInterface(socketpath: string, rdb: Database) {
    db = rdb;
    setupAPIServer(socketpath, handleError, x => dispatchImpl(x, {
        default: { getLiveInfo, getPlayInfo, getArchives },
    }));
}
export function shutdownWebInterface() {
    shutdownAPIServer(handleError);
}
