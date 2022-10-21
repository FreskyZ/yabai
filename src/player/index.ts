import { $default as api } from '../api/client';
import type { LiveInfo } from '../api/types';
import Hls from 'hls.js';
import { inflate } from 'pako';
// import { brotliDec } from 'brotli-dec-wasm';

const ui = {
    video: document.querySelector('video'),
    mask: document.querySelector('div#video-mask') as HTMLDivElement,
    control: document.querySelector('div#control-panel') as HTMLDivElement,
    icon: document.querySelector("link[rel~='icon']") as HTMLLinkElement,
    livemark: document.querySelector('span#live-mark') as HTMLSpanElement,
    chatmark: document.querySelector('span#chat-mark') as HTMLSpanElement,
    title: document.querySelector('div#live-title') as HTMLDivElement,
    chats: document.querySelector('div#chat-container') as HTMLDivElement,
};

const hash = window.location.hash.substring(1);
const roomId = isNaN(parseInt(hash)) ? 92613 : parseInt(hash);

async function play(liveinfo: LiveInfo) {
    // ui.icon.href = liveinfo.avatarImage; // not work
    ui.title.innerText = `${liveinfo.title} - ${liveinfo.userName}`;
    ui.title.title = ui.title.innerText;
    document.title = `${liveinfo.title} - ${liveinfo.userName} - 单推播放器`;
    if (liveinfo.live == 'live') {
        ui.livemark.classList.add('active');
        const playinfo = await api.getPlayInfo(liveinfo.realId);
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.attachMedia(ui.video);
            hls.on(Hls.Events.ERROR, (event, data) => console.log('hls error', event, data));
            // hls.on(Hls.Events.MANIFEST_PARSED, () => elements.video.play());
            hls.attachMedia(ui.video);
            hls.loadSource(playinfo.find(p => p.protocol == 'http_hls' && p.format == 'fmp4' && p.codec == 'avc').url);
        } else {
            ui.video.src = playinfo.find(p => p.protocol == 'http_stream' && p.format == 'flv' && p.codec == 'avc').url;
            ui.video.play();
        }
    } else {
        ui.video.style.display = 'none';
    }
}

// control panel position manage is not complex nor very easy
function initcontrol() {
    ui.control.style.width = '280px';
    ui.control.style.height = '400px';
    ui.control.style.left = 'calc(100vw / 2 - 100px)';
    ui.control.style.top = 'calc(100vh / 2 - 200px)';
}

// html requires autoplay to be muted, allow click anywhere (mask) to unmut
ui.mask.onclick = () => {
    ui.video.muted = false;
};

interface DragData { mouseX: number, mouseY: number, elementX: number, elementY: number }
ui.control.ondragstart = e => {
    e.dataTransfer.dropEffect = 'move';
    // or else cannot "drop into self"
    ui.control.style.height = '24px';
    const rect = ui.control.getBoundingClientRect();
    const data: DragData = { mouseX: e.clientX, mouseY: e.clientY, elementX: rect.x, elementY: rect.y };
    e.dataTransfer.setData('text/plain', JSON.stringify(data));
};
ui.mask.ondragover = e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};
ui.mask.ondrop = e => {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('text/plain')) as DragData;
    const newX = data.elementX + e.clientX - data.mouseX;
    const newY = data.elementY + e.clientY - data.mouseY;
    ui.control.style.left = `${Math.max(newX, 0)}px`;
    ui.control.style.top = `${Math.max(newY, 0)}px`;
    ui.control.style.height = '400px';
};

// this is similar to server/chat, but you really cannot reuse because
// 1. server side get chat conf log error, browser version throw error
// 2. server side use Buffer, browser version use typed array
// 3. server side save to storage, browser version display on ui
// 4. server side log to log, browser version log to console
// 5. server side tries to be alive (e.g. assertStructure), browser version just refresh page
// 6. server side tries to archive as much info, browser version only displays interest info
// 7. server side try to infer time, browser version display them directly 

type ChatItem = {
    userId: number,
    userName: string, // may be incomplete or not available for kind=entry
    text: string, // text for danmu or superchat, or other kinds' remaining part comma separated
    color?: number, // text color for danmu, also integer representation for hex rgb
    price?: number, // super chat price or charged gift price in Chinese Yuan
    emoticon?: string, // application custom emoticon, include common or liver specific
    memberActive?: boolean, // member is now darken (not displayed) if inactive (not interactive with that liver)
    memberName?: string, // liver specific name for his/her fans
    memberLevel?: number,
    memberLevelColor?: number, // integer representation for hex rgb
}

function display(item: ChatItem) {
    console.log(item);
}

class ChatClient {

    private connection: WebSocket = null;
    public constructor(
        private readonly realId: number,
    ) {}

    // caller to prevent reentry and timeout abort
    // this is just a more graceful close (immediate resolve or resolve on close), so should be ok for reconnect
    public async stop(): Promise<void> {
        ui.chatmark.classList.remove('active');
        if (!this.connection || this.connection.readyState == WebSocket.CLOSED) {
            return;
        }
        return new Promise(resolve => {
            if (this.connection.readyState == WebSocket.CONNECTING) {
                this.connection.addEventListener('close', () => resolve());
                // don't know whether ok to close when opening, so wait
                this.connection.addEventListener('open', () => this.connection.close());
            } else if (this.connection.readyState == WebSocket.OPEN) {
                this.connection.addEventListener('close', () => resolve());
                this.connection.close();
            } else if (this.connection.readyState == WebSocket.CLOSING) {
                this.connection.addEventListener('close', () => resolve());
            }
        });
    }

    private transform(raw: any) {
        if (raw.cmd == 'DANMU_MSG') {
            const item: ChatItem = {
                userId: raw.info[2][0],
                userName: raw.info[2][1],
                // I don't understand how they send a bare CR in danmu message
                text: raw.info[1].trim().replaceAll('\r', '').replaceAll('\n', ''),
                color: raw.info[0][3],
                emoticon: raw.info[0][13].emoticon_unique,
            }
            if (raw.info[3].length) {
                item.memberActive = raw.info[3][11];
                item.memberLevel = raw.info[3][0];
                item.memberLevelColor = raw.info[3][4];
                item.memberName = raw.info[3][1];
            }
            display(item);

        } else if (raw.cmd == 'SUPER_CHAT_MESSAGE') {
            const item: ChatItem = {
                userId: raw.data.uid,
                userName: raw.data.user_info.uname,
                text: raw.data.message,
                price: raw.data.price,
            };
            if (raw.data.medal_info) {
                item.memberActive = raw.data.medal_info.is_lighted;
                item.memberLevel = raw.data.medal_info.medal_level;
                item.memberLevelColor = parseInt(raw.data.medal_info.medal_color.substring(1), 16);
                item.memberName = raw.data.medal_info.medal_name;
            }
            display(item);

        } else if (raw.cmd == 'ROOM_CHANGE') {
            ui.title = raw.data.title;
        } else if (raw.cmd == 'LIVE') {
            if (raw.live_time) {
                ui.livemark.classList.add('active');
            } else {
                // there seems to be 2 live notices, use the one with time and discard another
            }
        } else if (raw.cmd == 'PREPARING') {
            ui.livemark.classList.remove('active');
        }
    }

    // see server/chat.ts for packet structure
    private createPacket(packet_type: 'verify' | 'heartbeat', data: Uint8Array) {
        const result = new Uint8Array(16 + data.length);
        result.set(data, 16);
        const view = new DataView(result.buffer);
        // ATTENTION: this parameter order is (offset,value), reverse of Buffer.write* methods
        view.setUint32(0, data.length + 16);
        view.setUint16(4, 16);
        view.setUint16(6, 1);
        view.setUint32(8, packet_type == 'verify' ? 7 : 2);
        view.setUint32(12, 1);
        return result;
    };

    public async start() {
        await this.stop();
        const { token, url } = await api.getChatConf(this.realId);

        console.log(`connecting to ${url}`)
        this.connection = new WebSocket(url);
        this.connection.binaryType = 'arraybuffer';

        this.connection.addEventListener('error', error => {
            console.log('websocket error', error);
            // this seems will not happen in several days of test, so directly abort
            this.stop();
        });

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        this.connection.addEventListener('open', () => {
            console.log(`websocket connected to ${url}`);

            this.connection.send(this.createPacket('verify', encoder.encode(
                // ATTENTION: protover=2
                // although inflate and brotli is widely used in content encoding,
                // there is no convenient javascript api/library for that, current brotli library require wasm, investigate later
                JSON.stringify({ roomid: this.realId, protover: 2, platform: 'yabai', type: 2, key: token }))));
            const verifyTimeout = setTimeout(() => {
                console.log('websocket verify timeout, reconnect');
                this.start();
            }, 20_000);

            // send heartbeat per 30 seconds,
            // if heartbeat response not received between this interval, that is timeout and reconnect
            let heartbeatResponseReceived = 1;
            const sendHeartbeat = () => {
                if (heartbeatResponseReceived) {
                    // it seems that server does not care about heartbeat's data
                    this.connection.send(this.createPacket('heartbeat', encoder.encode('你妈什么时候死啊')));
                    heartbeatResponseReceived = 0;
                    setTimeout(sendHeartbeat, 30_000);
                } else {
                    console.log('websocket heartbeat response timeout, reconnect');
                    this.start();
                }
            };

            this.connection.addEventListener('message', (event: MessageEvent<ArrayBuffer>) => {
                let packet = new Uint8Array(event.data);
                if (packet.length < 16) {
                    console.log(`invalid packet, too small`, packet);
                    return;
                }

                // heartbeat response does not have json body
                let packetview = new DataView(packet.buffer);
                const packetType = packetview.getUint32(8);
                if (packetType == 3) {
                    // the u32 at offset 16 for view data is deprecated, they are currently using ONLINE_RANK_COUNT and WATCHED_CHANGE
                    heartbeatResponseReceived = 1;
                    return;
                } 

                // decompress packed packets
                try {
                    const protocolVersion = packetview.getUint16(6);
                    if (protocolVersion == 2) {
                        packet = inflate(packet.subarray(16));
                        packetview = new DataView(packet.buffer);
                    // } else if (protocolVersion == 3) {
                    //     packet = brotliDec(packet.subarray(16));
                    //     packetview = new DataView(packet.buffer);
                    } else if (protocolVersion != 0 && protocolVersion != 1) {
                        console.log(`invalid packet, unknown protocol version`, packet);
                        return;
                    }
                } catch (error) {
                    console.log(`invalid packet, failed to decompress`, packet, error);
                    return;
                }

                let index = 0;
                let offset = 0;
                while (offset < packet.length) {
                    const chunkSize = packetview.getUint32(offset);
                    const chunkType = packetview.getUint32(offset + 8);
                    let json: any;
                    try {
                        json = JSON.parse(decoder.decode(packet.subarray(offset + 16, offset + chunkSize)));
                    } catch (error) {
                        console.log(`invalid packet chunk#${index}, failed to parse json`, packet.subarray(offset, offset + 16), error);
                        index += 1;
                        offset += chunkSize;
                        continue;
                    }

                    if (chunkType == 8) {
                        console.log(`websocket verify response received`);
                        ui.chatmark.classList.add('active');
                        clearTimeout(verifyTimeout);
                        sendHeartbeat();
                    } else if (chunkType == 5) {
                        this.transform(json);
                    } else {
                        console.log(`invalid packet chunk#${index}, unknown chunk type`, packet.subarray(offset, offset + 16));
                    }
                    index += 1;
                    offset += chunkSize;
                }
            });
        });
    }
}

// mypack currently only supports commonjs, so cannot top level await for now
(async () => {
    const liveinfo = await api.getLiveInfo(roomId);
    await play(liveinfo);
    initcontrol();
    new ChatClient(liveinfo.realId).start();
})();
