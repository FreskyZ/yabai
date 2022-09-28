import * as EventEmitter from 'events';
import * as fs from 'fs';
import { brotliDecompressSync, inflateSync } from 'zlib';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';
import { log } from './logger';

// live chat client
// how to interact with wacq and fine and display realtime message on web page TBD

export interface ChatMessage {
    time: number, // timestamp
    userId: number,
    userName: string,
    text?: string, // text for danmu or superchat
    giftAction?: string, // use as ${giftaction}${giftamount}{$giftname}
    giftAmount?: number,
    giftName?: string, // maybe captain; empty for superchat, although it can be 'SUPERCHAT'
    price?: number, // super chat price or charged gift price in Chinese Yuan
    coins?: number, // non charged gift price, in 'silver melon seed'
    emoticon?: string, // application custom emoticon, include common or liver specific
    manager?: boolean, // is room manager
    memberActive?: boolean, // member is now darken (not displayed) if inactive (not interactive with that liver)
    memberName?: string, // liver specific name for his/her fans
    memberLevel?: number,
    memberLevelColor?: number, // integer representation for hex rgb
    memberOwnerName?: string, // that liver's name, may be not available for some type of messages (SEND_GIFT)
    memberOwnerRoomId?: number, // that liver's room id, this is real id
    memberOwnerUserId?: number, // that liver's user id, may be not available for some type of messages (SEND_GIFT)
}

export type ChatNotice = 
    | { kind: 'start', time: number }
    | { kind: 'stop', time: number } // this time is inferred
    | { kind: 'change-title', time: number, title: string } // this time is inferred
    | { kind: 'fans-amount', time: number, value: number } // this time is inferred
    | { kind: 'fans-club-amount', time: number, value: number } // this time is inferred
    | { kind: 'wacthed-amount', time: number, value: number } // this time is inferred
    | { kind: 'interacted-amount', time: number, value: number } // this time is inferred
    | { kind: 'enter', time: number, userId: number, userName?: string } // this username may be incomplete or unavailable

export class ChatClient extends EventEmitter {

    private connection: WebSocket;
    public constructor(private readonly realId: number) {
        super();
        this.connection = null;
        this.nonTimedItems = [];
    }

    // caller to prevent reentry and timeout abort
    // this is just a more graceful close (immediate resolve or resolve on close), so should be ok for reconnect
    public async stop(): Promise<void> {
        if (!this.connection || this.connection.readyState == WebSocket.CLOSED) {
            return;
        }
        return new Promise(resolve => {
            if (this.connection.readyState == WebSocket.CONNECTING) {
                this.connection.on('close', resolve);
                // don't know whether ok to close when opening, so wait
                this.connection.on('open', () => this.connection.close());
            } else if (this.connection.readyState == WebSocket.OPEN) {
                this.connection.on('close', resolve);
                this.connection.close();
            } else if (this.connection.readyState == WebSocket.CLOSING) {
                this.connection.on('close', resolve);
            }
        });
    }

    // assign time to non timed message once a timed message is received, should be ok for current knonw non timed messages
    private readonly nonTimedItems: { raw: any, normalized: any, eventName: string }[];
    private handleNormalized(raw: any, normalized: any, eventName: string) {
        if (normalized.time) {
            // no need to wait on log
            log.message(JSON.stringify(raw));
            log.message(JSON.stringify(normalized));
            this.emit(eventName, normalized);
            for (const item of this.nonTimedItems) {
                item.normalized.time = normalized.time;
                log.message(JSON.stringify(item.raw));
                log.message(JSON.stringify(item.normalized));
                this.emit(item.eventName, item.normalized);
            }
            this.nonTimedItems.splice(0, this.nonTimedItems.length);
        } else {
            this.nonTimedItems.push({ raw, normalized, eventName });
        }
    }

    private handleNotice(raw: any) {

        if (raw.cmd == 'DANMU_MSG') {
            const message: ChatMessage = {
                time: raw.info[9].ts,
                userId: raw.info[2][0],
                userName: raw.info[2][1],
                text: raw.info[1].trim().replaceAll('\r', '').replaceAll('\n', ''),
                emoticon: raw.info[0][13].emoticon_unique,
            }
            if (raw.info[2][2] != 0) {
                message.manager = true;
            }
            if (raw.info[3].length) {
                message.memberActive = raw.info[3][11];
                message.memberLevel = raw.info[3][0];
                message.memberLevelColor = raw.info[3][4];
                message.memberName = raw.info[3][1];
                message.memberOwnerName = raw.info[3][2];
                message.memberOwnerRoomId = raw.info[3][3];
                message.memberOwnerUserId = raw.info[3][12];
            }
            this.handleNormalized(raw, message, 'message');

        } else if (raw.cmd == 'WATCHED_CHANGE') {
            const notice: ChatNotice = {
                time: 0,
                kind: 'wacthed-amount',
                value: raw.data.num,
            };
            this.handleNormalized(raw, notice, 'notice');

        } else if (raw.cmd == 'ONLINE_RANK_COUNT') {
            const notice: ChatNotice = {
                time: 0,
                kind: 'interacted-amount',
                value: raw.data.count,
            }
            this.handleNormalized(raw, notice, 'notice');

        } else if (raw.cmd == 'ENTRY_EFFECT') {
            const startIndex = raw.data.copy_writing.indexOf('<%');
            const endIndex = raw.data.copy_writing.indexOf('%>');
            // ignore if unrecognized structure, but this seems never happen
            if (startIndex != -1 && endIndex != -1) {
                const notice: ChatNotice = {
                    time: Math.ceil(raw.data.trigger_time / 1000_000_000),
                    kind: 'enter',
                    userId: raw.data.uid,
                    userName: raw.data.copy_writing.substring(startIndex + 2, endIndex),
                };
                this.handleNormalized(raw, notice, 'notice');
            }
        } else if (raw.cmd == 'SUPER_CHAT_MESSAGE') {
            const message: ChatMessage = {
                time: raw.data.start_time,
                userId: raw.data.uid,
                userName: raw.data.user_info.uname,
                text: raw.data.message,
                price: raw.data.price,
            };
            if (raw.data.manager != 0) {
                message.manager = true;
            }
            if (raw.data.medal_info) {
                message.memberActive = raw.data.medal_info.is_lighted;
                message.memberLevel = raw.data.medal_info.medal_level;
                message.memberLevelColor = raw.data.medal_info.medal_color;
                message.memberName = raw.data.medal_info.anchor_name;
                message.memberOwnerName = raw.data.medal_info.anchor_uname;
                message.memberOwnerRoomId = raw.data.medal_info.anchor_roomid;
                message.memberOwnerUserId = raw.data.medal_info.target_id;
            }
            this.handleNormalized(raw, message, 'message');

        } else if (raw.cmd == 'SEND_GIFT') {
            const message: ChatMessage = {
                time: raw.data.start_time,
                userId: raw.data.uid,
                userName: raw.data.uname,
                giftAction: raw.data.action,
                giftAmount: raw.data.num,
                giftName: raw.data.giftName,
                price: raw.data.coin_type == 'silver' ? 0 : Math.ceil(raw.data.coin_amount / 1000),
                coins: raw.data.coin_type == 'silver' ? raw.data.total_coin : 0,
            };
            if (raw.data.medal_info) {
                message.memberActive = raw.data.medal_info.is_lighted;
                message.memberLevel = raw.data.medal_info.medal_level;
                message.memberLevelColor = raw.data.medal_info.medal_color;
                message.memberName = raw.data.medal_info.anchor_name;
                message.memberOwnerName = raw.data.medal_info.anchor_uname;
                message.memberOwnerRoomId = raw.data.medal_info.anchor_roomid;
                message.memberOwnerUserId = raw.data.medal_info.target_id;
            }
            this.handleNormalized(raw, message, 'message');

        } else if (raw.cmd == 'GUARD_BUY') {
            const message: ChatMessage = {
                time: raw.data.start_time,
                userId: raw.data.uid,
                userName: raw.data.username,
                giftAmount: raw.data.num,
                giftName: raw.data.gift_name,
            };
            this.handleNormalized(raw, message, 'message');

        } else if (raw.cmd == 'ROOM_REAL_TIME_MESSAGE_UPDATE') {
            const notice1: ChatNotice = {
                time: 0,
                kind: 'fans-amount',
                value: raw.data.fans,
            }
            const notice2: ChatNotice = {
                time: 0,
                kind: 'fans-club-amount',
                value: raw.data.fans_club,
            }
            this.handleNormalized(raw, notice1, 'notice');
            this.handleNormalized(raw, notice2, 'notice');

        } else if (raw.cmd == 'ROOM_CHANGE') {
            const notice: ChatNotice = {
                time: 0,
                kind: 'change-title',
                title: raw.data.title,
            };
            this.handleNormalized(raw, notice, 'notice');

        } else if (raw.cmd == 'LIVE') {
            // there seems to be 2 live notices, use the one with time
            if (raw.live_time) {
                const notice: ChatNotice = {
                    time: raw.live_time,
                    kind: 'start',
                };
                this.handleNormalized(raw, notice, 'notice');
            }
        } else if (raw.cmd == 'PREPARING') {
            const notice: ChatNotice = {
                time: 0,
                kind: 'stop',
            };
            this.handleNormalized(raw, notice, 'notice');

        } else if (
            raw.cmd == 'HOT_RANK_CHANGED' // boring rank
            || raw.cmd == 'HOT_RANK_CHANGED_V2' // boring rank
            || raw.cmd == 'STOP_LIVE_ROOM_LIST' // confusions list
            || raw.cmd == 'ONLINE_RANK_V2' // boring rank
            || raw.cmd == 'ONLINE_RANK_TOP3' // boring rank
            || raw.cmd == 'HOT_RANK_SETTLEMENT_V2' // kind of boring rank
            || raw.cmd == 'HOT_RANK_SETTLEMENT' // boring rank
            || raw.cmd == 'WIDGET_BANNER' // boring banner
            || raw.cmd == 'ACTIVITY_BANNER_CHANGE' // boring banner
            || raw.cmd == 'ACTIVITY_BANNER_CHANGE_V2' // boring banner
            || raw.cmd == 'ROOM_SKIN_MSG' // not used feature
            || raw.cmd == 'INTERACT_WORD' // // this is too early, I forget
            || raw.cmd == 'LIKE_INFO_V3_UPDATE' // boring double click to like
            || raw.cmd == 'LIKE_INFO_V3_CLICK' // boring double click to like
            || raw.cmd == 'SUPER_CHAT_MESSAGE_DELETE' // this is not only not interested, complex to implement (reference by id), but also opposite of archive semantic
            || raw.cmd == 'ROOM_BLOCK_MSG' // if sc delete is not included, then is not included
            || raw.cmd == 'USER_TOAST_MSG' // appear together with guard buy, duplicate info
            || raw.cmd == 'COMBO_SEND' // appear together with normal gift send, does not affect total amount
            || raw.cmd == 'SUPER_CHAT_MESSAGE_JPN' // appear together with normal superchat, seems duplicate info
            || raw.cmd == 'LIVE_INTERACTIVE_GAME' // appear together with normal danmu, info already included in that
            || (raw.cmd == 'NOTICE_MSG' && raw.msg_type == 6) // boring other live room
            || (raw.cmd == 'NOTICE_MSG' && raw.msg_type == 2) // boring other live room
            || (raw.cmd == 'NOTICE_MSG' && raw.msg_type == 3) // appear together with guard_buy, duplicate info, also boring other live room
        ) {
            // discard because of too many, or meaningless, or both
            return;

        } else {
            log.message('!!!' + JSON.stringify(raw));
        }
    }

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
    private createPacket(packet_type: 'verify' | 'heartbeat', data: Buffer) {
        const header = Buffer.alloc(16);
        header.writeUInt32BE(data.length + 16, 0);
        header.writeUInt16BE(16, 4);
        header.writeUInt16BE(1, 6);
        header.writeUInt32BE(packet_type == 'verify' ? 7 : 2, 8);
        header.writeUInt32BE(1, 12);
        return Buffer.concat([header, data]);
    };

    private async getServer(): Promise<{ token: string, url: string }> {
        const response = await fetch(`https://api.live.bilibili.com/room/v1/Danmu/getConf?room_id=${this.realId}`);
        if (response.status != 200) {
            log.error(`failed to get chat client configuration, response ${response.status} ${response.statusText}`);
            return { token: null, url: null };
        }
        let body: any;
        try {
            body = await response.json();
        } catch (error) {
            log.error(`failed to get chat client configuration, failed to parse body, ${error}`);
            return { token: null, url: null };
        }
        if (body.code != 0 || !body.data || !body.data.host_server_list || !body.data.token) {
            log.error(`failed to get chat client configuration, unrecognized body, ${JSON.stringify(body)}`);
            return { token: null, url: null };
        }

        // there is several server list but only use first because
        // - normally one server address is enough
        // - when reconnecting by verify timeout or heartbeat response timeout, that is at least 30 seconds or even longer,
        //   with no knowledege of this token's expiration time, it's better to fetch again instead of try next url
        return { token: body.data.token, url: `wss://${body.data.host_server_list[0].host}:${body.data.host_server_list[0].wss_port}/sub` };
    }

    public async start() {
        await this.stop();
        const { token, url } = await this.getServer();

        log.info(`websocket connecting to ${url}`);
        this.connection = new WebSocket(url);
        this.connection.on('error', error => {
            log.error(`websocket error: ${error.message}`);
            // this seems will not happen in several days of test, so directly abort
            this.stop();
        });
        this.connection.on('open', () => {
            log.info(`websocket connected to ${url}`);

            this.connection.send(this.createPacket('verify', Buffer.from(
                JSON.stringify({ roomid: this.realId, protover: 3, platform: 'yabai', type: 2, key: token }))));
            const verifyTimeout = setTimeout(() => {
                log.error('websocket verify timeout, reconnect');
                this.start();
            }, 20_000);

            // send heartbeat per 30 seconds,
            // if heartbeat response not received between this interval, that is timeout and reconnect
            let heartbeatResponseReceived = 1;
            const sendHeartbeat = () => {
                if (heartbeatResponseReceived) {
                    // it seems that server does not care about heartbeat's data
                    this.connection.send(this.createPacket('heartbeat', Buffer.from('你妈什么时候死啊')));
                    heartbeatResponseReceived = 0;
                    setTimeout(sendHeartbeat, 30_000);
                } else {
                    log.error('websocket heartbeat response timeout, reconnect');
                    this.start();
                }
            };

            this.connection.on('message', (packet: Buffer) => {
                if (packet.length < 16) {
                    log.error(`invalid packet, too small, ${packet}`);
                    return;
                }

                // heartbeat response does not have json body
                const packetType = packet.readUInt32BE(8);
                if (packetType == 3) {
                    // the u32 at offset 16 for view data is deprecated, they are currently using ONLINE_RANK_COUNT and WATCHED_CHANGE
                    heartbeatResponseReceived = 1;
                    return;
                } 

                // decompress packed packets
                try {
                    const protocolVersion = packet.readUInt16BE(6);
                    if (protocolVersion == 2) {
                        packet = inflateSync(packet.subarray(16));
                    } else if (protocolVersion == 3) {
                        packet = brotliDecompressSync(packet.subarray(16));
                    } else if (protocolVersion != 0 && protocolVersion != 1) {
                        log.error(`invalid packet, unknown protocol version, ${packet}`);
                        return;
                    }
                } catch (error) {
                    log.error(`invalid packet, failed to decompress, ${packet} ${error}`);
                    return;
                }

                let index = 0;
                let offset = 0;
                while (offset < packet.length) {
                    const chunkSize = packet.readUInt32BE(offset);
                    const chunkType = packet.readUInt32BE(offset + 8);
                    let json: any;
                    try {
                        json = JSON.parse(packet.toString('utf-8', offset + 16, offset + chunkSize));
                    } catch (error) {
                        log.error(`invalid packet chunk#${index}, failed to parse json, ${packet.subarray(offset, offset + 16)}, ${error}`);
                        index += 1;
                        offset += chunkSize;
                        continue;
                    }

                    if (chunkType == 8) {
                        log.info(`websocket verify response received`);
                        clearTimeout(verifyTimeout);
                        sendHeartbeat();
                    } else if (chunkType == 5) {
                        this.handleNotice(json);
                    } else {
                        log.error(`invalid packet chunk#${index}, unknown chunk type, ${packet.subarray(offset, offset + 16)}`);
                    }
                    index += 1;
                    offset += chunkSize;
                }
            });
        });

        // don't know need this explicit keep process alive
        setInterval(() => {}, 1 << 30);
    }
}

const config = JSON.parse(fs.readFileSync('config.json', { encoding: 'utf-8' }));
const client = new ChatClient(config.roomId);

let shuttingdown = false;
function shutdown() {
    if (shuttingdown) return;
    shuttingdown = true;

    setTimeout(() => {
        log.info('yabai service stop timeout, abort');
        console.log('yabai service stop timeout, abort');
        process.exit(1);
    }, 10_000);

    client.stop().then(() => {
        log.info('yabai service stop');
        console.log('yabai service stop');
        process.exit(0);
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.start();
log.info('yabai service start');
console.log('yabai service start');
