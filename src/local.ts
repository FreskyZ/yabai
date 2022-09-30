import * as dayjs from 'dayjs';
import fetch from 'node-fetch'; // fetch is

// yabai local executable entry,
// which is a command line tool for live status and play urls,
// report error and input room id from command line instead of log and config file,
// how to intergrit with wacq and fine TBD, but currently a command line tool is better

async function getLiveStatus(): Promise<number> {
    const response = await fetch(
        `https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${roomId}`);
    if (response.status != 200) {
        console.log(`failed to get status, response ${response.status} ${response.statusText}`);
        return null;
    }

    let body: any;
    try {
        body = await response.json();
    } catch (error) {
        console.log(`failed to get status, cannot parse body`, error);
        return null;
    }
    if (body.code != 0 || !body.data || !body.data.room_info) {
        console.log(`failed to get status, unrecognized body`, body);
        return null;
    }

    // additional info maybe used when intergrited into wacq
    // body.data.room_info.cover: cover image url
    // body.data.room_info.area_name, parent_arena_name
    console.log(`[${body.data.anchor_info.base_info.uname}][${body.data.room_info.title}] ${
        // attention: 0 for not live, 1 for live, 2 for play video in loop
        body.data.room_info.live_status == 1 ? dayjs.unix(body.data.room_info.live_start_time).format('YYYY-MM-DD HH:mm:ss') : 'NOT LIVE'}`);
    return body.data.room_info.room_id;
}

async function displayPlayURL(realId: number): Promise<void> {
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
        + `?qn=400&protocol=0%2C1&format=0%2C1%2C2&codec=0%2C1&platform=h5&ptype=8&room_id=${realId}`);
    if (response.status != 200) {
        console.log(`failed to get urls, response ${response.status} ${response.statusText}`);
        return null;
    }

    let body: any;
    try {
        body = await response.json();
    } catch (error) {
        console.log(`failed to get urls, cannot parse body`, error);
        return null;
    }
    if (body.code != 0 || !body.data || !body.data.playurl_info
        || !body.data.playurl_info.playurl || !body.data.playurl_info.playurl.stream) {
        console.log(`displayPlayURL failed, unrecognized body`, body);
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

const roomId = parseInt(process.argv[2]);
if (isNaN(roomId)) {
    console.log('invalid room id, use with yaba ROOMID or yaba ROOMID url');
    process.exit(1);
}

getLiveStatus().then(realId => {
    if (process.argv[3] == 'url') {
        displayPlayURL(realId).then(() => process.exit(0));
    }
});
