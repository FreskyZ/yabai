import fs from 'fs';
import dayjs from 'dayjs';
import { WebSocket } from 'ws';
import { brotliDecompressSync, inflateSync } from 'zlib';

// roomid displayed in browser
const ROOM_ID = 213;

async function get_room_info() {
    const response = await fetch(`https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${ROOM_ID}`);
    if (response.status != 200) {
        console.log('get_room_info failed, response not ok', response);
        return;
    }
    const json = await response.json();
    if (json.code != 0 || !json.data || !json.data.room_info) {
        console.log('get_room_info failed, response payload unrecognized', json);
        return;
    }
    const room_info = json.data.room_info;
    return {
        real_id: room_info.room_id, // number
        title: room_info.title,     // string
        cover: room_info.cover,     // string, image url
        live_status: room_info.live_status, // number, 0 or 1
        live_start_time: room_info.live_start_time,  // number, timestamp (seconds)
    };
}

async function get_room_play_url(real_id) {
    const response = await fetch('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo'
        // qn: 10000: 原画, 400: 蓝光, 150: 高清
        // protocol: 0: stream protocol, 1: hls protocol, multiple split by ',' (%2C)
        // format: 0: flv (use with protocol=0), 1: ts, 2: fmp4 (these 2 use with protocol=1), multiple split by ','
        // codec: 0: avc, 1: hevc, multiple split by ',', hevc seems have compatible and performance issue
        + `?qn=400&protocol=0%2C1&format=0%2C1%2C2&codec=0%2C1&platform=h5&ptype=8&room_id=${real_id}`);
    if (response.status != 200) {
        console.log('get_room_play_rul failed, response not ok', response);
        return;
    }
    const json = await response.json();
    if (json.code != 0 || !json.data || !json.data.playurl_info
        || !json.data.playurl_info.playurl || !json.data.playurl_info.playurl.stream) {
        console.log('get_room_play_url failed, response payload unrecognized', json);
        return;
    }

    const stream = json.data.playurl_info.playurl.stream;
    const results = [];
    for (const protocol of stream) {
        const protocol_name = protocol.protocol_name;
        for (const format of protocol.format) {
            const format_name = format.format_name;
            for (const codec of format.codec) {
                const codec_name = codec.codec_name;
                const base_url = codec.base_url;
                for (const url_info of codec.url_info) {
                    results.push({
                        protocol: protocol_name, // http_stream | http_hls
                        format: format_name,     // flv | ts | fmp
                        codec: codec_name,       // avc | hevc
                        url: `${url_info.host}${base_url}${url_info.extra}`,
                        ttl: url_info.stream_ttl, // number, seconds, seems always 3600
                    });
                }
            }
        }
    }
    return results;
}

// log message
const logm = fs.openSync('messages.txt', 'a');
const logma = fs.openSync('message-additional.txt', 'a');
// logother
const logo = fs.openSync('other-messages.txt', 'a');

function handleNotice(notice) {

    if (notice.cmd == 'DANMU_MSG') {
        const time = notice.info[9].ts;
        const userid = notice.info[2][0];
        const username = notice.info[2][1];
        const content = notice.info[1];
        const displaymember = notice.info[3].length > 0 ? notice.info[3][11] : 1;
        const memberlevel = notice.info[3].length > 0 ? notice.info[3][0] : '';
        const membername = notice.info[3].length > 0 ? notice.info[3][1] : 'not member';
        const memberownername = notice.info[3].length > 0 ? notice.info[3][2] : '';
        const memberownerroomid = notice.info[3].length > 0 ? notice.info[3][3] : '';
        const memberowneruserid = notice.info[3].length > 0 ? notice.info[3][12] : '';
        fs.writeFileSync(logm, `[${time}] ${username}(${userid}): ${content} (${displaymember ? '' : '(hide)'}${membername}${memberlevel}, ${memberownername}, ${memberowneruserid}, ${memberownerroomid})\n`);
        fs.writeFileSync(logma, JSON.stringify(notice) + '\n');
    } else if (notice.cmd == 'SUPER_CHAT_MESSAGE') {
        const time = notice.data.start_time;
        const endtime = notice.data.end_time;
        const userid = notice.data.uid;
        const username = notice.data.user_info.uname;
        const content = notice.data.message;
        const price = notice.data.price;
        const memberlevel = notice.data.medal_info ? notice.data.medal_info.medal_level : '';
        const membername = notice.data.medal_info ? notice.data.medal_info.medal_name : 'not member';
        const memberownername = notice.data.medal_info ? notice.data.medal_info.anchor_uname : '';
        const memberownerroomid = notice.data.medal_info ? notice.data.medal_info.anchor_roomid : '';
        const memberowneruserid = notice.data.medal_info ? notice.data.medal_info.target_id : '';
        fs.writeFileSync(logm, `[${time}-${endtime}] $${price} ${username}(${userid}): ${content} (${membername}${memberlevel}, ${memberownername}, ${memberowneruserid}, ${memberownerroomid})\n`);
        fs.writeFileSync(logma, JSON.stringify(notice) + '\n');
    } else if (notice.cmd == 'INTERACT_WORD' || notice.cmd == 'LIKE_INFO_V3_UPDATE' || notice.cmd == 'HOT_RANK_CHANGED'
        || notice.cmd == 'HOT_RANK_CHANGED_V2' || notice.cmd == 'LIKE_INFO_V3_CLICK' || notice.cmd == 'STOP_LIVE_ROOM_LIST'
        || notice.cmd == 'HOT_RANK_SETTLEMENT_V2' 
        || (notice.cmd == 'NOTICE_MSG' && notice.msg_type == 6) // irrelavent other live room
    ) {
        // discard because of too many, or meaningless, or both
        return;
    } else if (notice.cmd == 'SEND_GIFT') {
        const time = notice.data.timestamp;
        const userid = notice.data.uid;
        const username = notice.data.uname;
        const action = notice.data.action;
        const amount = notice.data.num;
        const giftname = notice.data.giftName;
        const memberlevel = notice.data.medal_info ? notice.data.medal_info.medal_level : '';
        const membername = notice.data.medal_info ? notice.data.medal_info.medal_name : 'not member';
        const memberowneruserid = notice.data.medal_info ? notice.data.medal_info.target_id : '';
        fs.writeFileSync(logm, `[${time}] ${username}(${userid}) ${action}了${amount}${giftname} (${membername}${memberlevel}, ${memberowneruserid})\n`);
        fs.writeFileSync(logma, JSON.stringify(notice) + '\n');
    } else {
        // WATCH_CHANGE: 看过（热度降级版）
        // ONLINE_RANK_COUNT: 高能用户数量（送过礼物或发过弹幕的人数）
        // ROOM_REAL_TIME_MESSAGE_UPDATE: fans: 粉丝数量, fans_club: 粉丝团数量
        // ENTRY_EFFECT
        // TODO: GUARD_BUY, should be many at 0:00
        fs.writeFileSync(logo, JSON.stringify(notice) + '\n');
    }
}

let /** @type {WebSocket} */ socket;
async function danmu(real_id) {
    const response = await fetch(`https://api.live.bilibili.com/room/v1/Danmu/getConf?room_id=${real_id}`);
    if (response.status != 200) {
        console.log('danmu_get_conf failed, response not ok', response);
        return;
    }
    const json = await response.json();
    if (json.code != 0 || !json.data || !json.data.host_server_list || !json.data.token) {
        console.log('danmu_get_conf failed, response payload unrecognized', json);
        return;
    }

    const token = json.data.token;
    // normally use [0] is enough
    const url = `wss://${json.data.host_server_list[0].host}:${json.data.host_server_list[0].wss_port}/sub`;

    // packet structure, binary, big endian {
    //    // offset 0, include this field
    //    length: u32,
    //    // offset 4, header length, fixed 16
    //    unknown: u16,
    ///   // offset 6,
    //    // for sending, 1 for verify/heartbeat,
    //    // for receiving, this is verify packet's protover, 0 for raw json, 2 for deflate json, 3 for brotli json
    //    protocol_version: u16,
    //    // offset 8
    //    // for sending, 2 for heartbeat, 7 for verify
    //    // for receiving, 3 for heartbeat response, 8 for verify success, 5 for notice
    //    packet_type: u32,
    //    // offset 12, fixed 1
    //    unknown: u32,
    //    // the inlined data
    //    data: [u8],
    // }
    const createPacket = (/** @type {'verify' | 'heartbeat'} */ packet_type, /** @type {Buffer} */ data) => {
        const header = Buffer.alloc(16);
        header.writeUInt32BE(data.length + 16, 0);
        header.writeUInt16BE(16, 4);
        header.writeUInt16BE(1, 6);
        header.writeUInt32BE(packet_type == 'verify' ? 7 : 2, 8);
        header.writeUInt32BE(1, 12);
        return Buffer.concat([header, data]);
    };

    socket = new WebSocket(url, { origin: 'https://live.bilibili.com' });
    socket.on('error', error => {
        console.log('socket error', error);
        shutdown();
    });
    socket.on('open', () => {
        console.log('connected');
        socket.send(createPacket('verify', Buffer.from(JSON.stringify(
            { roomid: real_id, protover: 3, platform: 'yabai', type: 2, key: token }))));

        // send heartbeat per 30
        let heartbeat_response_received = 1;
        const send_heartbeat = () => {
            if (!heartbeat_response_received) {
                console.log('heartbeat response timeout, retry');
                socket.close();
                get_room_info().then(info => { if (info.live_status) { danmu(); } });
            }
            // it seems that server does not care about heartbeat's data
            socket.send(createPacket('heartbeat', Buffer.from('蒙古上单：你妈什么时候死啊')));
            heartbeat_response_received = 0;
            setTimeout(send_heartbeat, 30_000);
        };

        const verify_timeout = setTimeout(() => {
            console.log('verify timeout, retry');
            socket.close();
            get_room_info().then(info => { if (info.live_status) { danmu(); } });
        }, 20_000);

        socket.on('message', (/** @type {Buffer} */packet) => {
            if (packet.length < 16) {
                console.log('invalid packet', packet);
                return;
            }

            // heartbeat response does not have json body
            const packet_type = packet.readUInt32BE(8);
            if (packet_type == 3) {
                if (packet.length >= 20) {
                    const viewed = packet.readUInt32BE(16);
                    // console.log(`heartbeat response, viewed ${viewed}`);
                }
                heartbeat_response_received = 1;
                return;
            } 

            try {
                const protocol_version = packet.readUInt16BE(6);
                if (protocol_version == 2) {
                    packet = inflateSync(packet.subarray(16));
                } else if (protocol_version == 3) {
                    packet = brotliDecompressSync(packet.subarray(16));
                } else if (protocol_version != 0 && protocol_version != 1) {
                    console.log('seems unknown protocol version', packet);
                    return;
                }
            } catch (error) {
                console.log('decompress packet failed', packet, error);
                return;
            }

            let offset = 0;
            while (offset < packet.length) {
                const chunk_size = packet.readUInt32BE(offset);
                const packet_type = packet.readUInt32BE(offset + 8);
                let json;
                try {
                    json = JSON.parse(packet.toString('utf-8', offset + 16, offset + chunk_size));
                } catch (error) {
                    console.log('parse chunk json failed', packet.subarray(offset, offset + 16), error);
                    continue;
                }

                if (packet_type == 8) {
                    console.log('verified');
                    clearTimeout(verify_timeout);
                    send_heartbeat();
                } else if (packet_type == 5) {
                    handleNotice(json);
                } else {
                    console.log('seems unknown packet type', packet.subarray(offset, offset + 16));
                }
                offset += chunk_size;
            }
        });
    });

    // don't know need this explicit keep process alive
    setInterval(() => {}, 1 << 30);
}

let shuttingdown = 0;
function shutdown() {
    if (shuttingdown) return;
    shuttingdown = 1;

    setTimeout(() => {
        console.log('socket close timeout, abort');
        process.exit(1);
    }, 10_000);
    if (socket.readyState == WebSocket.OPEN || socket.readyState == WebSocket.CONNECTING) {
        socket.close();
    }
    socket.on('close', (code) => { process.exit(0) });
}

const room_info = await get_room_info();
console.log(`[${room_info.real_id}][${room_info.title}] ${room_info.live_status ? `living start ${dayjs.unix(room_info.live_start_time)}` : 'not living'}`);

if (room_info.live_status) {
    if (process.argv[2] == 'playurl') {
        for (const url of await get_room_play_url(room_info.real_id)) {
            console.log(`[${url.protocol}][${url.format}][${url.codec}][${url.ttl}] ${url.url}`);
        }
    }
    danmu(room_info.real_id);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
