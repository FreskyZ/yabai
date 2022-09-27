import { ROOM_ID, myfetch } from './common';
import { mylog } from './logger';

export interface LiveStatus {
    realId: number,
    title: string,
    coverImage: string,
    live: boolean,
    liveStartTime: number, // timestamp
}

export async function getLiveStatus(): Promise<LiveStatus> {
    const body = await myfetch('getLiveInfo',
        `https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${ROOM_ID}`);
    if (body.code != 0 || !body.data || !body.data.room_info) {
        mylog(`getLiveInfo failed, unrecognized body, ${JSON.stringify(body)}`);
        return null;
    }
    const room_info = body.data.room_info;
    return {
        realId: room_info.room_id,
        title: room_info.title,
        coverImage: room_info.cover,
        live: room_info.live_status != 0,
        liveStartTime: room_info.live_start_time,
    };
}

// additional service, available to command line, not think up of how to integrite with wacq and fine yet
export async function displayPlayURL(realId: number) {
    const body = await myfetch('displayPlayURL',
        'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo'
        // qn: 10000: original, 400: blueray, 150: high resolution
        //     official app/website display this, although sometime
        //     the file name of original quality is 'blueray', and 'high resolution' is lowest resolution
        // protocol: 0: http stream, 1: http hls
        //           accept multiple by join by ',' (don't forget encodeURIComponent)
        // format: 0: flv (use with protocol=0), 1: ts, 2: fmp4 (these 2 use with protocol=1)
        //            accept multiple by join by ','
        // codec: 0: avc, 1: hevc, accept multiple by join by ',', hevc seems have compatible and performance issue
        + `?qn=400&protocol=0%2C1&format=0%2C1%2C2&codec=0%2C1&platform=h5&ptype=8&room_id=${realId}`);
    if (body.code != 0 || !body.data || !body.data.playurl_info
        || !body.data.playurl_info.playurl || !body.data.playurl_info.playurl.stream) {
        mylog(`displayPlayURL failed, unrecognized body, ${JSON.stringify(body)}`);
        return;
    }

    // result is a cross product of input options
    for (const byProtocol of body.data.playurl_info.playurl.stream) {
        for (const byFormat of byProtocol.format) {
            for (const byCodec of byFormat.codec) {
                for (const urlInfo of byCodec.url_info) {
                    const prefixes = [byProtocol.protocol_name, byFormat.format_name, byCodec.codec_name, urlInfo.stream_ttl];
                    console.log(`${prefixes.map(p => `[${p}]`).join('')} ${urlInfo.host}${byCodec.base_url}${urlInfo.extra}`);
                }
            }
        }
    }
}
