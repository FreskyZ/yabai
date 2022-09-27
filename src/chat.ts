import * as fs from 'fs';
import { brotliDecompressSync, inflateSync } from 'zlib';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';
import { getLiveStatus } from './live-status';

// live chat client, archive to database
// not think up of how to interact with wacq and fine to display realtime chat for now

const noticelog = fs.openSync('notices.txt', 'a');

function handleNotice(notice: any) {

    if (notice.cmd == 'DANMU_MSG') {
        const time = notice.info[9].ts;
        const userid = notice.info[2][0];
        const username = notice.info[2][1];
        const content = notice.info[1].replaceAll('\r', '').replaceAll('\n', '');
        const emoticon = notice.info[0][13].emoticon_unique;
        const ismanager = notice.info[2][2] != 0;
        const displaymember = notice.info[3].length > 0 ? notice.info[3][11] : 1;
        const memberlevel = notice.info[3].length > 0 ? notice.info[3][0] : '';
        const memberlevelcolor = notice.info[3].length > 0 ? notice.info[3][4].toString(16).padStart(6, '0') : '';
        const membername = notice.info[3].length > 0 ? notice.info[3][1] : '';
        const memberownername = notice.info[3].length > 0 ? notice.info[3][2] : '';
        const memberownerroomid = notice.info[3].length > 0 ? notice.info[3][3] : '';
        const memberowneruserid = notice.info[3].length > 0 ? notice.info[3][12] : '';
        console.log(`${ismanager ? '[房]' : ''}${membername ? `[${membername}${memberlevel}]` : ''}${username}: ${emoticon ? `[${emoticon}] ` : ''}${content}`);
        fs.writeFileSync(noticelog, `[${time}] ${username}(${userid}): ${emoticon ? `[${emoticon}] ` : ''}${content} ${ismanager ? '[房] ' : ''}(${displaymember ? '' : '(hide)'}${membername}${memberlevel}, #${memberlevelcolor}, ${memberownername}, ${memberowneruserid}, ${memberownerroomid})\n`);
        fs.writeFileSync(noticelog, JSON.stringify(notice) + '\n');

    } else if (notice.cmd == 'SUPER_CHAT_MESSAGE') {
        const time = notice.data.start_time;
        const userid = notice.data.uid;
        const username = notice.data.user_info.uname;
        const content = notice.data.message;
        const price = notice.data.price;
        const ismanager = notice.data.user_info.manager != 0;
        const memberlevel = notice.data.medal_info ? notice.data.medal_info.medal_level : '';
        const memberlevelcolor = notice.data.medal_info ? notice.data.medal_info.medal_color.toString(16).padStart(6, '0') : '';
        const membername = notice.data.medal_info ? notice.data.medal_info.medal_name : '';
        const memberownername = notice.data.medal_info ? notice.data.medal_info.anchor_uname : '';
        const memberownerroomid = notice.data.medal_info ? notice.data.medal_info.anchor_roomid : '';
        const memberowneruserid = notice.data.medal_info ? notice.data.medal_info.target_id : '';
        console.log(`${ismanager ? '[房]' : ''}${username}: ￥${price} ${content}`);
        fs.writeFileSync(noticelog, `[${time}] ￥${price} ${username}(${userid}): ${content} ${ismanager ? '[房] ' : ''}(${membername}${memberlevel}, #${memberlevelcolor}, ${memberownername}, ${memberowneruserid}, ${memberownerroomid})\n`);
        fs.writeFileSync(noticelog, JSON.stringify(notice) + '\n');

    } else if (notice.cmd == 'SEND_GIFT') {
        const time = notice.data.timestamp;
        const userid = notice.data.uid;
        const username = notice.data.uname;
        const action = notice.data.action;
        const amount = notice.data.num;
        const giftname = notice.data.giftName;
        const coin_type = notice.data.coin_type;
        const coin_amount = notice.data.total_coin;
        const memberlevel = notice.data.medal_info ? notice.data.medal_info.medal_level : '';
        const memberlevelcolor = notice.data.medal_info ? notice.data.medal_info.medal_color.toString(16).padStart(6, '0') : '';
        const membername = notice.data.medal_info ? notice.data.medal_info.medal_name : 'not member';
        const memberowneruserid = notice.data.medal_info ? notice.data.medal_info.target_id : '';
        fs.writeFileSync(noticelog, `[${time}] ${username}(${userid}) ${action}了${amount}${giftname} ${coin_amount}${coin_type} (${membername}${memberlevel}, #${memberlevelcolor}, ${memberowneruserid})\n`);
        if (coin_type != 'silver' && coin_type != 'gold') {
            fs.writeFileSync(noticelog, '!!! unkwon coin type');
        }
        if (coin_type == 'gold' && Math.ceil(coin_amount / 100) * 100 != coin_amount) {
            fs.writeFileSync(noticelog, '!!! not 100x gold coin amount');
        }
        fs.writeFileSync(noticelog, JSON.stringify(notice) + '\n');

    } else if (notice.cmd == 'GUARD_BUY') {
        const time = notice.data.start_time;
        const userid = notice.data.uid;
        const username = notice.data.username;
        const amount = notice.data.num;
        const giftname = notice.data.gift_name;
        fs.writeFileSync(noticelog, `[${time}] ${username}(${userid}) 购买了${amount}${giftname}\n`);
        fs.writeFileSync(noticelog, JSON.stringify(notice) + '\n');

    } else if (notice.cmd == 'ENTRY_EFFECT') {
        const time = notice.data.trigger_time;
        const userid = notice.data.uid;
        const usernamestartindex = notice.data.copy_writing.indexOf('<%');
        const usernameendindex = notice.data.copy_writing.indexOf('%>');
        if (usernamestartindex == -1 || usernameendindex == -1) {
            fs.writeFileSync(noticelog, '!!!unrecognized entry effect');
            fs.writeFileSync(noticelog, JSON.stringify(notice) + '\n');
        } else {
            const username = notice.data.copy_writing.substring(usernamestartindex + 2, usernameendindex);
            console.log(`${username}: 进入直播间`);
            fs.writeFileSync(noticelog, `[${time}] ${username}(${userid}): 进入直播间\n`);
            fs.writeFileSync(noticelog, JSON.stringify(notice) + '\n');
        }

    } else if (notice.cmd == 'INTERACT_WORD' || notice.cmd == 'LIKE_INFO_V3_UPDATE' || notice.cmd == 'HOT_RANK_CHANGED'
        || notice.cmd == 'HOT_RANK_CHANGED_V2' || notice.cmd == 'LIKE_INFO_V3_CLICK' || notice.cmd == 'STOP_LIVE_ROOM_LIST'
        || notice.cmd == 'HOT_RANK_SETTLEMENT_V2' || notice.cmd == 'ONLINE_RANK_V2' || notice.cmd == 'ONLINE_RANK_TOP3'
        || notice.cmd == 'WIDGET_BANNER' || notice.cmd == 'ACTIVITY_BANNER_CHANGE' || notice.cmd == 'ACTIVITY_BANNER_CHANGE_V2'
        || notice.cmd == 'ROOM_SKIN_MSG'
        || notice.cmd == 'HOT_RANK_SETTLEMENT' // 保住老二, but I'm not interested
        || notice.cmd == 'USER_TOAST_MSG' // appear beside guard buy, duplicate info
        || notice.cmd == 'COMBO_SEND' // appear beside normal gift send, does not affect total amount
        || notice.cmd == 'SUPER_CHAT_MESSAGE_JPN' // this appear beside non JPN and chinese part is duplicate
        || notice.cmd == 'LIVE_INTERACTIVE_GAME' // liver specific emoticon, this sends beside normal DANMU_MSG and DANMU_MSG already have this info
        || (notice.cmd == 'NOTICE_MSG' && (notice.msg_type == 6 || notice.msg_type == 2) // irrelavent other live room
        || (notice.cmd == 'NOTICE_MSG' && notice.msg_type == 3)) // guard_buy is enough, this also include other live room's guard, also discard
    ) {
        // discard because of too many, or meaningless, or both
        return;

    } else {
        // WATCHED_CHANGE: 看过（热度降级版）
        // ONLINE_RANK_COUNT: 高能用户数量（送过礼物或发过弹幕的人数）
        // ROOM_REAL_TIME_MESSAGE_UPDATE: fans: 粉丝数量, fans_club: 粉丝团数量
        // ROOM_BLOCK_MSG: ban
        // ROOM_CHANGE: change title
        // LIVE + PREPARING: seems can connect forever
        if (notice.cmd != 'WATCHED_CHANGE' && notice.cmd != 'ONLINE_RANK_COUNT' && notice.cmd != 'ROOM_REAL_TIME_MESSAGE_UPDATE'
            && notice.cmd != 'ROOM_BLOCK_MSG' && notice.cmd != 'ROOM_CHANGE') {
            fs.writeFileSync(noticelog, '!!!');
        }
        fs.writeFileSync(noticelog, JSON.stringify(notice) + '\n');
    }
}

let socket: WebSocket;
export async function setupChatClient(realId: number) {
    const response = await fetch(`https://api.live.bilibili.com/room/v1/Danmu/getConf?room_id=${realId}`);
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
    const createPacket = (packet_type: 'verify' | 'heartbeat', data: Buffer) => {
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
        shutdownChatClient();
    });
    socket.on('open', () => {
        console.log('connected');
        socket.send(createPacket('verify', Buffer.from(JSON.stringify(
            { roomid: realId, protover: 3, platform: 'yabai', type: 2, key: token }))));

        // send heartbeat per 30
        let heartbeat_response_received = 1;
        const send_heartbeat = () => {
            if (!heartbeat_response_received) {
                console.log('heartbeat response timeout, retry');
                socket.close();
                getLiveStatus().then(info => { if (info.live) { setupChatClient(realId); } });
            }
            // it seems that server does not care about heartbeat's data
            socket.send(createPacket('heartbeat', Buffer.from('蒙古上单：你妈什么时候死啊')));
            heartbeat_response_received = 0;
            setTimeout(send_heartbeat, 30_000);
        };

        const verify_timeout = setTimeout(() => {
            console.log('verify timeout, retry');
            socket.close();
            getLiveStatus().then(info => { if (info.live) { setupChatClient(realId); } });
        }, 20_000);

        socket.on('message', (packet: Buffer) => {
            if (packet.length < 16) {
                console.log('invalid packet', packet);
                return;
            }

            // heartbeat response does not have json body
            const packet_type = packet.readUInt32BE(8);
            if (packet_type == 3) {
                // the u32 at offset 16 for view data is deprecated, they are currently using ONLINE_RANK_COUNT and WATCH_CHANGE
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

export function shutdownChatClient() {
    if (socket.readyState == WebSocket.OPEN || socket.readyState == WebSocket.CONNECTING) {
        socket.close();
    }
}
