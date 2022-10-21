// import { brotliDec } from 'brotli-dec-wasm';
import Hls from 'hls.js';
import { inflate } from 'pako';
import { $default as api } from '../api/client';
import type { LiveInfo } from '../api/types';

const ui = {
    video: document.querySelector('video'),
    mask: document.querySelector('div#video-mask') as HTMLDivElement,
    control: document.querySelector('div#control-panel') as HTMLDivElement,
    icon: document.querySelector("link[rel~='icon']") as HTMLLinkElement,
    livemark: document.querySelector('span#live-mark') as HTMLSpanElement,
    chatmark: document.querySelector('span#chat-mark') as HTMLSpanElement,
    elapsed: document.querySelector('div#live-elapsed') as HTMLDivElement,
    title: document.querySelector('div#live-title') as HTMLDivElement,
    chatcontainer: document.querySelector('div#chat-container') as HTMLDivElement,
    danmus: [] as HTMLDivElement[],
};

let danmucount = 16;
new Array(danmucount).fill(0).map(() => {
    const danmu = document.createElement('div');
    danmu.classList.add('chat-item');
    const price = document.createElement('span');
    price.classList.add('price');
    danmu.appendChild(price);
    const member = document.createElement('span');
    member.classList.add('member');
    danmu.appendChild(member);
    const username = document.createElement('span');
    username.classList.add('username');
    danmu.appendChild(username);
    const content = document.createElement('span');
    content.classList.add('content');
    danmu.appendChild(content);
    content.innerText = '按屏幕的任意区域（除了弹幕区域）取消静音';
    ui.danmus.push(danmu);
    ui.chatcontainer.appendChild(danmu);
});

const hash = window.location.hash.substring(1);
const roomId = isNaN(parseInt(hash)) ? 92613 : parseInt(hash);

// mypack.externals (or terser) currently does not correctly handle import * as dayjs from 'dayjs'
declare const dayjs: any;

let elapsedTimeout: number = 0;
function handleElapsed(startTime: number): () => void {
    // capture startTime
    return () => {
        const elapsedMinutes = dayjs().diff(dayjs.unix(startTime), 'minutes');
        ui.elapsed.innerText = `${Math.floor(elapsedMinutes / 60).toString().padStart(2, '0')}:${(elapsedMinutes % 60).toString().padStart(2, '0')}`;
    };
}

// control panel position manage is not complex nor very easy
function setupLayout() {
    ui.control.style.width = '280px';
    ui.control.style.height = '600px';
    ui.control.style.left = 'calc(100vw / 2 - 140px)';
    ui.control.style.top = 'calc(100vh / 2 - 200px)';
}

function refreshLayout() {
    const videoHeightByWidth = ui.video.videoHeight * document.body.scrollWidth / ui.video.videoWidth;
    const videoWidthByHeight = ui.video.videoWidth * document.body.scrollHeight / ui.video.videoHeight;

    if (videoHeightByWidth > document.body.scrollHeight) {
        // height is not enough
        ui.video.style.width = `${videoWidthByHeight}px`;
        ui.video.style.height = `100vh`;
    } else if (videoWidthByHeight > document.body.scrollWidth) {
        ui.video.style.width = '100vw';
        ui.video.style.height = `${videoHeightByWidth}px`;
    } else {
        ui.video.style.width = `${ui.video.videoWidth}px`;
        ui.video.style.height = `${ui.video.videoHeight}px`;
    }

    // mobile device or narrow window on pc (not really, pc version seems to limit to 500px)
    if (document.body.scrollWidth < 480) {
        ui.control.style.left = '0px';
        ui.control.style.top = ui.video.style.height;
        ui.control.style.width = '100vw';
    }
}

let resizeTimeout: number;
window.addEventListener('resize', () => {
    // throttle resize event
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(refreshLayout, 50) as unknown as number;
});

// html requires autoplay to be muted, allow click anywhere (mask) to unmut
ui.mask.onclick = () => {
    ui.video.muted = false;
};

interface DragData { mouseX: number, mouseY: number, elementX: number, elementY: number }
ui.control.ondragstart = e => {
    e.dataTransfer.dropEffect = 'move';
    // or else cannot "drop into self"
    ui.control.style.height = '26px';
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
    ui.control.style.height = '600px';
};

async function play(liveinfo: LiveInfo) {

    ui.elapsed.innerText = '00:00';
    // ui.icon.href = liveinfo.avatarImage; // not work
    ui.title.innerText = `${liveinfo.title} - ${liveinfo.userName}`;
    ui.title.title = ui.title.innerText;
    document.title = `${liveinfo.title} - ${liveinfo.userName} - 单推播放器`;

    if (liveinfo.live == 'live') {
        ui.livemark.classList.add('active');
        handleElapsed(liveinfo.startTime)();
        elapsedTimeout = setInterval(handleElapsed(liveinfo.startTime), 30_000) as unknown as number;
        const playinfo = await api.getPlayInfo(liveinfo.realId);
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.attachMedia(ui.video);
            hls.on(Hls.Events.ERROR, (event, data) => console.log('hls error', event, data));
            ui.video.addEventListener('loadedmetadata', refreshLayout);
            hls.attachMedia(ui.video);
            hls.loadSource(playinfo.find(p => p.protocol == 'http_hls' && p.format == 'fmp4' && p.codec == 'avc').url);
        } else {
            ui.video.src = playinfo.find(p => p.protocol == 'http_stream' && p.format == 'flv' && p.codec == 'avc').url;
            ui.video.play();
        }
    } else {
        clearTimeout(elapsedTimeout);
        ui.livemark.classList.remove('active');
        ui.video.style.display = 'none';
    }
}

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
    memberActive?: boolean, // member is now darken (not displayed) if inactive (not interactive with that liver)
    memberName?: string, // liver specific name for his/her fans
    memberLevel?: number,
    memberLevelColor?: number, // integer representation for hex rgb
}

// don't need sync at all because javascript is single threaded
// this is even batched because multi items in one packet is between 2 animation frame
let nextIndex = 0;
function displayChatItem(item: ChatItem) {

    const danmu = ui.danmus[nextIndex];
    const price = danmu.querySelector('span.price') as HTMLSpanElement;
    const member = danmu.querySelector('span.member') as HTMLSpanElement;
    const username = danmu.querySelector('span.username') as HTMLSpanElement;
    const content = danmu.querySelector('span.content') as HTMLSpanElement;
    if (item.price) {
        price.style.display = 'inline';
        price.innerText = `￥${item.price}`;
    } else {
        price.style.display = 'none';
    }
    if (item.memberActive) {
        member.style.display = 'inline';
        member.innerText = `${item.memberName}${item.memberLevel}`;
        member.style.backgroundColor = '#' + item.memberLevelColor.toString(16).padStart(6, '0') + 'CF';
    } else {
        member.style.display = 'none';
    }
    username.innerText = item.userName;
    content.innerText = item.text;
    if (item.color) {
        content.style.color = '#' + item.color.toString(16).padStart(6, '0') + 'CF';
    } else {
        content.style.color = '#FFFFFFCF';
    }

    ui.chatcontainer.removeChild(danmu);
    ui.chatcontainer.appendChild(danmu);
    nextIndex = (nextIndex + 1) % danmucount;
}

let connection: WebSocket = null;

// caller to prevent reentry and timeout abort
// this is just a more graceful close (immediate resolve or resolve on close), so should be ok for reconnect
async function stopChatClient(): Promise<void> {
    ui.chatmark.classList.remove('active');
    if (!connection || connection.readyState == WebSocket.CLOSED) {
        return;
    }
    return new Promise(resolve => {
        if (connection.readyState == WebSocket.CONNECTING) {
            connection.addEventListener('close', () => resolve());
            // don't know whether ok to close when opening, so wait
            connection.addEventListener('open', () => connection.close());
        } else if (connection.readyState == WebSocket.OPEN) {
            connection.addEventListener('close', () => resolve());
            connection.close();
        } else if (connection.readyState == WebSocket.CLOSING) {
            connection.addEventListener('close', () => resolve());
        }
    });
}

function handleRawChatItem(raw: any) {
    if (raw.cmd == 'DANMU_MSG') {
        const item: ChatItem = {
            userId: raw.info[2][0],
            userName: raw.info[2][1],
            // I don't understand how they send a bare CR in danmu message
            text: raw.info[1].trim().replaceAll('\r', '').replaceAll('\n', ''),
            color: raw.info[0][3],
        }
        if (raw.info[3].length) {
            item.memberActive = raw.info[3][11];
            item.memberLevel = raw.info[3][0];
            item.memberLevelColor = raw.info[3][4];
            item.memberName = raw.info[3][1];
        }
        displayChatItem(item);

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
        // write superchat to console is really easier and ok to use then special logic and ui
        console.log(item);
        displayChatItem(item);

    } else if (raw.cmd == 'ROOM_CHANGE') {
        ui.title = raw.data.title;
    } else if (raw.cmd == 'LIVE') {
        if (raw.live_time) {
            api.getLiveInfo(roomId).then(play);
        } else {
            // there seems to be 2 live notices, use the one with time and discard another
        }
    } else if (raw.cmd == 'PREPARING') {
        api.getLiveInfo(roomId).then(play);
    }
}

// see server/chat.ts for packet structure
function createPacket(packet_type: 'verify' | 'heartbeat', data: Uint8Array) {
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

async function startChatClient(realId: number) {
    await stopChatClient();
    const { token, url } = await api.getChatConf(realId);

    console.log(`websocket connecting to ${url}`)
    connection = new WebSocket(url);
    connection.binaryType = 'arraybuffer';

    connection.addEventListener('error', error => {
        console.log('websocket error', error);
        // this seems will not happen in several days of test, so directly abort
        stopChatClient();
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    connection.addEventListener('open', () => {
        console.log(`websocket connected to ${url}`);

        connection.send(createPacket('verify', encoder.encode(
            // ATTENTION: protover=2
            // although inflate and brotli is widely used in content encoding,
            // there is no convenient javascript api/library for that, current brotli library require wasm, investigate later
            JSON.stringify({ roomid: realId, protover: 2, platform: 'yabai', type: 2, key: token }))));
        const verifyTimeout = setTimeout(() => {
            console.log('websocket verify timeout, reconnect');
            startChatClient(realId);
        }, 20_000);

        // send heartbeat per 30 seconds,
        // if heartbeat response not received between this interval, that is timeout and reconnect
        let heartbeatResponseReceived = 1;
        const sendHeartbeat = () => {
            if (heartbeatResponseReceived) {
                // it seems that server does not care about heartbeat's data
                connection.send(createPacket('heartbeat', encoder.encode('你妈什么时候死啊')));
                heartbeatResponseReceived = 0;
                setTimeout(sendHeartbeat, 30_000);
            } else {
                console.log('websocket heartbeat response timeout, reconnect');
                startChatClient(realId);
            }
        };

        connection.addEventListener('message', (event: MessageEvent<ArrayBuffer>) => {
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
                    handleRawChatItem(json);
                } else {
                    console.log(`invalid packet chunk#${index}, unknown chunk type`, packet.subarray(offset, offset + 16));
                }
                index += 1;
                offset += chunkSize;
            }
        });
    });
}

// mypack currently only supports commonjs, so cannot top level await for now
(async () => {
    const liveinfo = await api.getLiveInfo(roomId);
    await play(liveinfo);
    setupLayout();
    startChatClient(liveinfo.realId);
})();
