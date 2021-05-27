import websockets
import zlib
import asyncio
import json
import datetime
import sys
from bilibili_api import utils

room_id = int(sys.argv[1])
display_time = False

heartbeat_task = None
websocket_connection = None
connection_status = 0 # 连接状态，0未连接，1已连接，2已正常断开，-1异常断开

def log(message: str):
    print(f"{datetime.datetime.now().strftime('%X')} [SYSTEM] {message}")

async def send_verify(token: str):
    verify_payload = { "uid": 0, "roomid": room_id, "protover": 2, "platform": "web", "clientver": "1.17.0", "type": 2, "key": token }
    # [4]: size, [2]: const 16, [2]: heartbeat protocol 1, [4]: datapack type verify 7, [4]: const 1, [var]: payload
    verify_datapack = bytearray(b'\x00\x10\x00\x01\x00\x00\x00\x07\x00\x00\x00\x01')
    verify_datapack += json.dumps(verify_payload).encode()
    verify_datapack = (len(verify_datapack) + 4).to_bytes(4, byteorder='big') + verify_datapack
    await websocket_connection.send(bytes(verify_datapack))

async def send_heartbeat():
    while connection_status == 1:
        #log("send heartbeat")
        await websocket_connection.send(b'\x00\x00\x00\x10\x00\x10\x00\x01\x00\x00\x00\x02\x00\x00\x00\x01')
        await asyncio.sleep(30.0)

async def receive_data():
    raw = await websocket_connection.recv()
    raw_payload = zlib.decompress(raw[16:]) if raw[7] == 2 else raw # 2: data format gzip

    offset = 0
    while offset < len(raw_payload):
        chunk_header = raw_payload[offset : offset + 16]
        chunk_size = sum(chunk_header[i] * 256 ** (3 - i) for i in range(0, 4))
        chunk_payload = raw_payload[offset + 16 : offset + chunk_size]

        if chunk_header[7] == 1 and chunk_header[11] == 3:
            # only heartbeat response does not have json payload while its payload is not interest
            # log('receive heartbeat response')
            pass
        else:
            chunk_data = json.loads(chunk_payload.decode())
            if chunk_header[11] == 8:
                log('receive verify success' if chunk_data['code'] == 0 else 'receive verify fail')
            elif chunk_header[11] == 5: # finally actual message
                await receive_message(chunk_data)
        offset += chunk_size

async def receive_message(message):
    if message['cmd'] == 'DANMU_MSG':
        info = message['info']
        time = datetime.datetime.fromtimestamp(float(info[9]['ts'])).strftime('%X') if display_time else ''
        member = '房' if info[2][2] else '舰' if info[2][7] else ''
        medal = f'{info[3][1]}{info[3][0]}' if len(info[3]) else ''
        user = info[2][1]
        content = info[1]
        print(' '.join([x for x in [time, (f'[{member}]' if member else '') + (f'[{medal}]' if medal else ''), f'{user}:', content] if x]))
    elif message['cmd'] == 'SUPER_CHAT_MESSAGE':
        data = message['data']
        time = datetime.datetime.fromtimestamp(float(data['ts'])).strftime('%X') if display_time else ''
        price = f"${data['price']}"
        member = '舰' if 'medal_info' in data and 'guard_level' in data['medal_info'] and int(data['medal_info']['guard_level']) else ''
        medal = f"{data['medal_info']['medal_name']}{data['medal_info']['medal_level']}" if 'medal_info' in data else ''
        user = data['user_info']['uname']
        content = data['message']
        print(' '.join(x for x in [time, price, (f'[{member}]' if member else '') + (f'[{medal}]' if medal else ''), f'{user}:', content] if x))

async def loop():
    global connection_status
    while True:
        try:
            await receive_data()
        except websockets.ConnectionClosed:
            if connection_status == 2:
                log("connection closed")
                return
            else:
                connection_status = -1
                log("connection closed abnormal")
            if heartbeat_task is not None:
                heartbeat_task.cancel()
            break

async def main():
    global connection_status
    global websocket_connection
    global heartbeat_task

    log("loading config")
    chat_conf = utils.request(\
        method='GET', \
        url='https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo',\
        params={ "id": room_id, 'type': 0 })
    log("loaded config")
    log("connecting")
    for host in chat_conf["host_list"]:
        uri = f"wss://{host['host']}:{host['wss_port']}/sub"
        log(f"connecting host {uri}")
        try:
            async with websockets.connect(uri) as ws:
                websocket_connection = ws
                log(f"send verify")
                await send_verify(chat_conf["token"])
                connection_status = 1
                heartbeat_task = asyncio.create_task(send_heartbeat())
                await loop()
                if connection_status >= 0:
                    return
        except websockets.ConnectionClosedError:
            log(f"connect host {uri} failed, try next")
    else:
        connection_status = -1
        log(f"connect failed")

try:
    asyncio.get_event_loop().run_until_complete(main())
except KeyboardInterrupt:
    connection_status = 2
    asyncio.gather(websocket_connection.close())
