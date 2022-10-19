import * as fs from 'fs/promises';
import * as path from 'path';
import { brotliDecompressSync, inflateSync } from 'zlib';
import * as dayjs from 'dayjs';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';
import { log } from './logger';
import { Database } from './database';

// live chat client
// how to interact with wacq and fine and display realtime message on web page TBD

// it is strange to put other as first item in file ()
type MessageKind =
    // the kind with many information and will save to db
    | 'message'
type OtherItemKind =
    // this is the only non message kind with many fields,
    // the number of text part is still 2 if regarded as comma separated,
    // but internally it uses plus (+) to keep things still structural (can be read by program)
    // text: `${userId}+${userName}`,`${action}+${amount}+${giftname}+${price}+${coins}` 
    | 'gift'
    // and this split from gift
    // text: `${userId}+${userName}`,`${amount}+${giftname}+${price}`
    | 'guard'
    // text: userId,userName(maybe incomplete, but the userid is correct)
    | 'entry'
    // text: (empty),(empty)
    | 'start'
    // time is inferred, text: (empty),(empty)
    | 'stop'
    // time is inferred, text: (empty),new-title
    | 'change-title'
    // time is inferred, text: new-value,(empty)
    | 'fans-amount'
    // time is inferred, text: new-value,(empty)
    | 'fans-club-amount'
    // time is inferred, text: new-value,(empty)
    | 'watched-amount'
    // time is inferred, text: new-value,(empty)
    | 'interacted-amount'

type ChatItem = {
    time: number, // timestamp
    kind: MessageKind,
    userId: number,
    userName: string, // may be incomplete or not available for kind=entry
    text: string, // text for danmu or superchat, or other kinds' remaining part comma separated
    color?: number, // text color for danmu
    price?: number, // super chat price or charged gift price in Chinese Yuan
    emoticon?: string, // application custom emoticon, include common or liver specific
    manager?: boolean, // is room manager
    memberActive?: boolean, // member is now darken (not displayed) if inactive (not interactive with that liver)
    memberName?: string, // liver specific name for his/her fans
    memberLevel?: number,
    memberLevelColor?: number, // integer representation for hex rgb
    memberOwnerName?: string, // that liver's name, may be not available for some type of messages (SEND_GIFT)
    memberOwnerRoomId?: number, // that liver's room id, this is real id
    memberOwnerUserId?: number, // that liver's user id, may be not available for some type of messages (SEND_GIFT)
} | {
    time: number,
    kind: OtherItemKind,
    text: string,
}

// store received items,
// also handle swtich file for noticelog and swtich table for messagelog
export class ChatStorage {

    // similar to logger, except no cleanup
    private fileNotFlushCount: number = 0;
    private fileNotFlushTimeout: NodeJS.Timeout = null;
    private filetime: dayjs.Dayjs = dayjs.utc();
    private file: fs.FileHandle = null;
    public constructor(private readonly db: Database) {
        setInterval(this.createSplitTable.bind(this), 3600_000);
    }

    // close file and close connection
    public async close() {
        await Promise.all([
            (async () => {
                if (this.file) {
                    await this.file.sync();
                    if (this.fileNotFlushTimeout) {
                        clearTimeout(this.fileNotFlushTimeout);
                    }
                    await this.file.close();
                }
            })(),
            this.db.close(),
        ]);
    }

    // ChatStorage.save does not prevent reentry, prevent here
    private openingTask: Promise<void> = null;
    private async openNotice() {
        if (!this.openingTask) {
            this.openingTask = (async () => {
                await fs.mkdir('notice', { recursive: true });
                this.file = await fs.open(path.resolve('notice', `${this.filetime.format('YYYYMMDD')}.csv`), 'a');
                this.openingTask = null;
            })();
        }
        await this.openingTask;
    }

    private async flushNotice() {
        // no if this.handle: according to flush strategy,
        // this function will not be called with this.handle == 0

        this.fileNotFlushCount = 0;
        await this.file.sync();

        if (this.fileNotFlushTimeout) {
            // clear timeout incase this flush is triggered by write
            // does not setup new timeout because now not flush count is 0
            clearTimeout(this.fileNotFlushTimeout);
            this.fileNotFlushTimeout = null;
        }
        // swtich file is not here, all notice should sit precisely in its date file
    }

    private async saveNotice(time: number, kind: OtherItemKind, text: string) {
        if (!this.file) {
            await this.openNotice();
        }
        await this.file.writeFile(`${time},${kind},${text}\n`);

        // switch file is here because all notice should sit precisely in its date file
        if (!dayjs.unix(time).utc().isSame(this.filetime, 'date')) {
            this.filetime = dayjs.utc();
            await this.file.close();
            await this.openNotice();
            this.fileNotFlushCount = null;
        } else if (this.fileNotFlushCount > 101) {
            await this.flushNotice();
        } else {
            this.fileNotFlushCount += 1;
            if (this.fileNotFlushCount == 1) {
                this.fileNotFlushTimeout = setTimeout(() => this.flushNotice(), 600_000);
            }
        }
    }

    private async createSplitTable() {
        const now = dayjs.utc();
        // create next table at last date of month
        if (now.isSame(now.endOf('month'), 'date')) {
            // // will now.add(1) receive rediculous result?
            const postfix = now.add(1, 'month').format('YYMM');
            try {
                this.db.query(`
                CREATE TABLE IF NOT EXISTS \`Message${postfix}\` (
                   \`Time\` TIMESTAMP NOT NULL,
                   -- message does not need time to differ danmu/superchat
                   \`UserId\` BIGINT NOT NULL,
                   \`UserName\` VARCHAR(100) NOT NULL, -- don't know the actual limit
                   \`Text\` VARCHAR(500) NOT NULL, -- don't know the actual limit, at least it is dynamic
                   \`Color\` INT NULL,
                   \`Emoticon\` VARCHAR(50) NULL,
                   \`Price\` INT NULL, -- the max amount I have ever seen is 100_000rmb, so int should be ok
                   \`Manager\` BIT(1) NOT NULL DEFAULT 0,
                    -- nullable boolean does not have much meaning, 0 for no medal info
                   \`MemberActive\` BIT(1) NOT NULL DEFAULT 0,
                   \`MemberLevel\` TINYINT NULL,
                   \`MemberLevelColor\` INT NULL,
                   \`MemberName\` VARCHAR(20) NULL, -- it seems to be max 3 chinese characters (9 bytes), so use 20
                   \`MemberOwnerName\` VARCHAR(100) NULL,
                   \`MemberOwnerRoomId\` BIGINT NULL,
                   \`MemberOwnerUserId\` BIGINT NULL
                );`);
            } catch (error) {
                log.error(`create table Message${postfix} error ${error}`);
            }
        }
    }

    // the number of question mark will be really many if not generated from this array automatically
    private static DatabaseColumnNames = ['Time', 'UserId', 'UserName', 'Manager', 'Text', 'Color', 'Emoticon', 'Price',
        'MemberActive', 'MemberLevel', 'MemberLevelColor', 'MemberName', 'MemberOwnerName', 'MemberOwnerRoomId', 'MemberOwnerUserId'];

    private async saveMessage(item: ChatItem) {
        if (item.kind != 'message') { return; } // this makes tsc understand kind=message

        // time is kind of external input, validate it more strictly
        if (!Number.isFinite(item.time)) {
            log.error('cannot save item because time is not number ' + JSON.stringify(item));
            return;
        }

        const postfix = dayjs.unix(item.time).utc().format('YYMM');
        // dayjs seems to give 19700101 on rediculous input value and say it is valid, so reject 7001
        if (postfix == '7001') {
            log.error('cannot save item because time is invalid ' + JSON.stringify(item));
            return;
        }

        const tableName = '`Message' + postfix + '`';
        const columnNames = ChatStorage.DatabaseColumnNames.map(c => '`' + c + '`').join(',');
        const questions = ChatStorage.DatabaseColumnNames.map(() => '?').join(',');

        // cannot use undefined for 'NOT NULL DEFAULT 0'
        item.manager = item.manager || false;
        item.memberActive = item.memberActive || false;
        try {
            await this.db.query(`INSERT INTO ${tableName} (${columnNames}) VALUES (${questions});`,
                // although I used timestamp everywhere,
                // mysql (not node mysql package) require insert statement to use formatted datetime not a number
                dayjs.unix(item.time).utc().format('YYYY-MM-DD HH:mm:ss'),
                // @ts-ignore this is a lot of columns again if written strong-typely
                ...ChatStorage.DatabaseColumnNames.slice(1).map(c => item[c.charAt(0).toLowerCase() + c.substring(1)]));
        } catch (error) {
            log.error(`failed to save to database ${error} ${JSON.stringify(item)}`);
        }
    }

    // // this is how I watch danmu before ui exists, don't forget the hard time (?)
    // // watch -n1 'cat logs/20220930M.log | grep -v cmd | grep -v kind | grep -v 投喂 | tail -40 | cut -c 50-140'
    public async save(item: ChatItem) {

        if (item.kind == 'message') {
            await this.saveMessage(item);
        } else {
            await this.saveNotice(item.time, item.kind, item.text);
            // insert special message for start and stop live
            if (item.kind == 'start') {
                await this.saveMessage({ time: item.time, kind: 'message', userId: 0, userName: '0', text: 'LIVE' });
            } else if (item.kind == 'stop') {
                await this.saveMessage({ time: item.time, kind: 'message', userId: 0, userName: '0', text: 'NOTLIVE' });
            }
        }
    }
}

export class ChatClient {

    private connection: WebSocket = null;
    public constructor(
        public readonly store: ChatStorage,
        private readonly realId: number,
    ) {}

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

    // use current time for non timed items
    // but restrict them with next timed item to make items monotonic
    // don't need to restrict them with previous timed item because it is not likely that server send me a "future" item
    private readonly inferredTimeItems: { raw: any, cooked: ChatItem }[] = [];

    // use cooked.time=0 to indicate time need infer,
    // // this cool type annotation limit this parameter to be ChatMessage when kind is message and vice versa
    // // so that the notice construction does not need explicit type assersion to track property usage (F12)
    private finishTransform(raw: any, cooked: ChatItem) {
        if (cooked.time) {
            log.debug(JSON.stringify(raw));
            log.debug(JSON.stringify(cooked));
            this.store.save(cooked);
            for (const item of this.inferredTimeItems) {
                if (item.cooked.time > cooked.time) {
                    item.cooked.time = cooked.time;
                }
                log.debug(JSON.stringify(item.raw));
                log.debug(JSON.stringify(item.cooked));
                this.store.save(item.cooked);
            }
            this.inferredTimeItems.splice(0, this.inferredTimeItems.length);
        } else {
            cooked.time = dayjs.utc().unix();
            this.inferredTimeItems.push({ raw, cooked });
        }
    }

    // assert to prevent read property on undefined error, get undefined value is not checked
    private assertStructure(raw: any, condition: boolean) {
        if (!condition) {
            log.error(`unrecognized ${raw.cmd} ${JSON.stringify(raw)}`);
        }
        return condition;
    }

    private transform(raw: any) {
        if (raw.cmd == 'DANMU_MSG') {
            if (!this.assertStructure(raw,
                raw.info
                && Array.isArray(raw.info)
                && Array.isArray(raw.info[0])
                && Array.isArray(raw.info[2])
                && Array.isArray(raw.info[3])
                && raw.info[9]
            )) { return; }

            const item: ChatItem = {
                time: raw.info[9].ts,
                kind: 'message',
                userId: raw.info[2][0],
                userName: raw.info[2][1],
                // I don't understand how they send a bare CR in danmu message
                text: raw.info[1].trim().replaceAll('\r', '').replaceAll('\n', ''),
                color: raw.info[0][3],
                emoticon: raw.info[0][13].emoticon_unique,
            }
            if (raw.info[2][2] != 0) {
                item.manager = true;
            }
            if (raw.info[3].length) {
                item.memberActive = raw.info[3][11];
                item.memberLevel = raw.info[3][0];
                item.memberLevelColor = raw.info[3][4];
                item.memberName = raw.info[3][1];
                item.memberOwnerName = raw.info[3][2];
                item.memberOwnerRoomId = raw.info[3][3];
                item.memberOwnerUserId = raw.info[3][12];
            }
            this.finishTransform(raw, item);

        } else if (raw.cmd == 'WATCHED_CHANGE') {
            if (!this.assertStructure(raw, raw.data)) { return; }
            this.finishTransform(raw, { time: 0, kind: 'watched-amount', text: `${raw.data.num},` });

        } else if (raw.cmd == 'ONLINE_RANK_COUNT') {
            if (!this.assertStructure(raw, raw.data)) { return; }
            this.finishTransform(raw, { time: 0, kind: 'interacted-amount', text: `${raw.data.count},` });

        } else if (raw.cmd == 'ENTRY_EFFECT') {
            if (!this.assertStructure(raw,
                raw.data 
                && typeof raw.data.copy_writing == 'string'
            )) { return; }
            const startIndex = raw.data.copy_writing.indexOf('<%');
            const endIndex = raw.data.copy_writing.indexOf('%>');
            if (!this.assertStructure(raw,
                startIndex != -1 && endIndex != -1
            )) { return; }
            this.finishTransform(raw, {
                time: Math.ceil(raw.data.trigger_time / 1000_000_000),
                kind: 'entry',
                text: `${raw.data.uid},${raw.data.copy_writing.substring(startIndex + 2, endIndex)}`,
            });

        } else if (raw.cmd == 'SUPER_CHAT_MESSAGE') {
            if (!this.assertStructure(raw,
                raw.data
                && raw.data.user_info
            )) { return; }
            const item: ChatItem = {
                time: raw.data.start_time,
                kind: 'message',
                userId: raw.data.uid,
                userName: raw.data.user_info.uname,
                text: raw.data.message,
                price: raw.data.price,
            };
            if (raw.data.manager != 0) {
                item.manager = true;
            }
            if (raw.data.medal_info) {
                if (!this.assertStructure(raw, 
                    typeof raw.data.medal_info.medal_color == 'string'
                    && raw.data.medal_info.medal_color.startsWith('#')
                    && raw.data.medal_info.medal_color.length <= 7
                )) { return; }
                item.memberActive = raw.data.medal_info.is_lighted;
                item.memberLevel = raw.data.medal_info.medal_level;
                item.memberLevelColor = parseInt(raw.data.medal_info.medal_color.substring(1), 16);
                item.memberName = raw.data.medal_info.medal_name;
                item.memberOwnerName = raw.data.medal_info.anchor_uname;
                item.memberOwnerRoomId = raw.data.medal_info.anchor_roomid;
                item.memberOwnerUserId = raw.data.medal_info.target_id;
            }
            this.finishTransform(raw, item);

        } else if (raw.cmd == 'SEND_GIFT') {
            if (!this.assertStructure(raw, 
                raw.data
                && ['silver', 'gold'].includes(raw.data.coin_type)
            )) { return; }
            const price = raw.data.coin_type == 'silver' ? 0 : Math.ceil(raw.data.total_coin / 1000);
            const coins = raw.data.coin_type == 'silver' ? raw.data.total_coin : 0;
            // send gift have same raw.data.medal_info like superchat, but they are discarded because
            // - I decide to put not interested items in a smaller table (at least no medal info)
            // - they are kind of too many (one 辣条 is one message)
            // - guard buy also does not have medal info
            // if (raw.data.medal_info) {
            //     ...
            // }
            this.finishTransform(raw, {
                time: raw.data.start_time,
                kind: 'gift',
                text: `${raw.data.uid}+${raw.data.uname},`
                    + `${raw.data.action}+${raw.data.num}+${raw.data.giftName}+${price}+${coins}`,
            });

        } else if (raw.cmd == 'GUARD_BUY') {
            if (!this.assertStructure(raw, raw.data)) { return; }
            const price = Math.ceil(raw.data.price / 1000);
            this.finishTransform(raw, {
                time: raw.data.start_time,
                kind: 'guard',
                text: `${raw.data.uid}+${raw.data.username},${raw.data.num}+${raw.data.gift_name}+${price}`,
            });

        } else if (raw.cmd == 'ROOM_REAL_TIME_MESSAGE_UPDATE') {
            if (!this.assertStructure(raw, raw.data)) { return; }
            this.finishTransform(raw, { time: 0, kind: 'fans-amount', text: `${raw.data.fans},` });
            this.finishTransform(raw, { time: 0, kind: 'fans-club-amount', text: `${raw.data.fans_club},` });

        } else if (raw.cmd == 'ROOM_CHANGE') {
            if (!this.assertStructure(raw, raw.data)) { return; }
            this.finishTransform(raw, { time: 0, kind: 'change-title', text: `,${raw.data.title}` });

        } else if (raw.cmd == 'LIVE') {
            if (raw.live_time) {
                this.finishTransform(raw, { time: raw.live_time, kind: 'start', text: ',' });
            } else {
                // there seems to be 2 live notices, use the one with time and discard another
            }
        } else if (raw.cmd == 'PREPARING') {
            this.finishTransform(raw, { time: 0, kind: 'stop', text: ',' });

        } else if (
            raw.cmd == 'HOT_RANK_CHANGED' // boring rank
            || raw.cmd == 'HOT_RANK_CHANGED_V2' // boring rank
            || raw.cmd == 'STOP_LIVE_ROOM_LIST' // confusions list
            || raw.cmd == 'ONLINE_RANK_V2' // boring rank
            || raw.cmd == 'ONLINE_RANK_TOP3' // boring rank
            || raw.cmd == 'HOT_RANK_SETTLEMENT_V2' // kind of boring rank
            || raw.cmd == 'HOT_RANK_SETTLEMENT' // boring rank
            || raw.cmd == 'COMMON_NOTICE_DANMAKU' // boring rank
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
            || raw.cmd == 'GUARD_HONOR_THOUSAND' // other liver's thousand guard notice
            || raw.cmd == 'LIVE_MULTI_VIEW_CHANGE' // unknown data
            || raw.cmd == 'NOTICE_MSG' // boring other live room, notice msg has completely proved its own meaningless
        ) {
            // discard because of too many, or meaningless, or both
            return;

        } else {
            log.error('unrecognized notice: ' + JSON.stringify(raw));
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
                        this.transform(json);
                    } else {
                        log.error(`invalid packet chunk#${index}, unknown chunk type, ${packet.subarray(offset, offset + 16)}`);
                    }
                    index += 1;
                    offset += chunkSize;
                }
            });
        });
    }
}
