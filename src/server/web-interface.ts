// import * as dayjs from 'dayjs';
import { Database } from './database';
import { FineError } from '../adk/error';
import { setupAPIServer, shutdownAPIServer } from '../adk/api-server'
import { dispatch as dispatchImpl } from "../api/server";
import type * as api from '../api/types';
import { log } from './logger';

// web interface implementations, currently they fit in one file

// this borrows ChatStorage.db, no need to finalize
let db: Database;

async function getLiveInfo(roomId: number): Promise<api.LiveInfo> {
    const response = await fetch(
        `https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${roomId}`);
    if (response.status != 200) {
        throw new FineError('internal', `live info: response ${response.status} ${response.statusText}`);
    }

    let body: any;
    try {
        body = await response.json();
    } catch (error) {
        throw new FineError('internal', `live info: cannot parse body ${error} ${response}`);
    }
    if (body.code != 0 || !body.data || !body.data.room_info) {
        throw new FineError('internal', `live info: unrecognized body ${JSON.stringify(body)}`);
    }

    return {
        realId: body.data.room_info.room_id,
        userName: body.data.anchor_info.base_info.uname,
        title: body.data.room_info.title,
        live: body.data.room_info.live_status == 1 ? 'live' : body.data.room_info.live_status == 2 ? 'loop' : 'no',
        startTime: body.data.room_info.live_status == 1 ? body.data.room_info.live_start_time : 0,
        coverImage: body.data.room_info.cover,
        parentAreanName: body.data.room_info.parent_arena_name,
        areaName: body.data.room_info.area_name,
        avatarImage: body.data.anchor_info.base_info.face,
    };
}

async function getPlayInfo(realId: number): Promise<api.PlayInfo[]> {
    const response = await fetch(
        'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo'
        // qn: 10000: original, 400: blueray, 150: high resolution
        //     official app/website display this, although sometime
        //     the file name of original quality is 'blueray', and 'high resolution' is lowest resolution
        // protocol: 0: http stream, 1: http hls
        //           accept multiple by join by ',' (don't forget encodeURIComponent)
        // format: 0: flv (use with protocol=0), 1: ts, 2: fmp4 (these 2 use with protocol=1)
        //            accept multiple by join by ','
        // codec: 0: avc, 1: hevc, accept multiple by join by ',', hevc seems have compatible and performance issue
        + `?qn=150&protocol=0%2C1&format=0%2C1%2C2&codec=0%2C1&platform=h5&ptype=8&room_id=${realId}`);
    if (response.status != 200) {
        throw new FineError('internal', `play info: response ${response.status} ${response.statusText}`);
    }

    let body: any;
    try {
        body = await response.json();
    } catch (error) {
        throw new FineError('internal', `play info: cannot parse body ${error} ${response}`);
    }
    if (body.code != 0 || !body.data || !body.data.playurl_info
        || !body.data.playurl_info.playurl || !body.data.playurl_info.playurl.stream) {
        throw new FineError('internal', `play info: unrecognized body ${JSON.stringify(body)}`);
    }

    // result is a cross product of input options
    const results: api.PlayInfo[] = [];
    for (const byProtocol of body.data.playurl_info.playurl.stream) {
        for (const byFormat of byProtocol.format) {
            for (const byCodec of byFormat.codec) {
                for (const urlInfo of byCodec.url_info) {
                    results.push({
                        protocol: byProtocol.protocol_name,
                        format: byFormat.format_name,
                        codec: byCodec.codec_name,
                        ttl: urlInfo.stream_ttl,
                        url: `${urlInfo.host}${byCodec.base_url}${urlInfo.extra}`,
                    });
                }
            }
        }
    }
    return results;
}

// this is same as the one in ./chat, with different error handling
async function getChatConf(realId: number): Promise<api.ChatConfiguration> {
    const response = await fetch(`https://api.live.bilibili.com/room/v1/Danmu/getConf?room_id=${realId}`);
    if (response.status != 200) {
        throw new FineError('internal', `chat conf: response ${response.status} ${response.statusText}`);
    }
    let body: any;
    try {
        body = await response.json();
    } catch (error) {
        throw new FineError('internal', `chat conf: cannot parse body ${error} ${response}`);
    }
    if (body.code != 0 || !body.data || !body.data.host_server_list || !body.data.token) {
        throw new FineError('internal', `chat conf: unrecognized body, ${JSON.stringify(body)}`)
    }

    // see ChatClient.getChatServer for reason for only use one
    return { token: body.data.token, url: `wss://${body.data.host_server_list[0].host}:${body.data.host_server_list[0].wss_port}/sub` };
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
        default: { getLiveInfo, getPlayInfo, getChatConf, getArchives },
    }));
}
export function shutdownWebInterface() {
    shutdownAPIServer(handleError);
}
