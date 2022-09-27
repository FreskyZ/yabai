

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
