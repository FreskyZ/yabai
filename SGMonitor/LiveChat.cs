using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace SGMonitor
{
    internal enum UserType
    {
        Normal,
        Member,
        Previledge,
    }

    internal struct LiveChat
    {
        public DateTime Time { get; set; }
        public int? Price { get; init; } // not null for super chat
        public string MedalInfo { get; init; } // 财布 21
        public string UserName { get; init; }
        public UserType UserType { get; init; }
        public string Content { get; init; }
    }

    internal class LiveChatClient
    {
        private static readonly HttpClient http_client = new();

        private readonly Logger logger;
        public LiveChatClient(Logger logger)
        {
            this.logger = logger;
        }

        private async Task<(string token, string[] urls)> getDanmuInfo()
        {
            using var query = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["type"] = "0",
                ["id"] = room_id.ToString(),
            });
            var response = await http_client.GetAsync(new UriBuilder
            {
                Scheme = "https",
                Host = "api.live.bilibili.com",
                Path = "/xlive/web-room/v1/index/getDanmuInfo",
                Query = await query.ReadAsStringAsync(),
            }.Uri);

            if (!response.IsSuccessStatusCode)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed with status {response.StatusCode}");
                throw new InvalidOperationException($"failed to get danmu info: status {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();
            logger.Log($"GET {response.RequestMessage.RequestUri} content {content}");

            try
            {
                var document = await JsonDocument.ParseAsync(new MemoryStream(Encoding.UTF8.GetBytes(content)));
                var data = document.RootElement.GetProperty("data");

                var token = data.GetProperty("token").GetString();
                var urls = data.GetProperty("host_list").EnumerateArray().Select(hostport =>
                    $"wss://{hostport.GetProperty("host").GetString()}:{hostport.GetProperty("wss_port").GetInt32()}/sub").ToArray();
                return (token, urls);
            }
            catch (Exception e) when (e is JsonException
                || e is InvalidOperationException || e is KeyNotFoundException || e is IndexOutOfRangeException)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed to parse content");
                throw new InvalidOperationException("failed to get live info: failed to parse content");
            }
        }
        private byte[] CreateVerifyData()
        {
            // this is complete magic
            return new byte[]
            {
                0,
                0,
                0,
                Convert.ToByte(27 + room_id.ToString().Length),
                0,
                16,
                0,
                1,
                0,
                0,
                0,
                7,
                0,
                0,
                0,
                1,
                123,
                34,
                114,
                111,
                111,
                109,
                105,
                100,
                34,
                58,
            }.Concat(Encoding.ASCII.GetBytes(room_id.ToString())).Concat(new byte[] { 125 }).ToArray();
        }

        private static readonly byte[] s_heartbeat = new byte[] { 0, 0, 0, 16, 0, 16, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1 };
        private async Task SendHeartBeat()
        {
            while (true) 
            {
                try
                {
                    await websocket.SendAsync(s_heartbeat, WebSocketMessageType.Binary, false, CancellationToken.None);
                    await Task.Delay(30_000);
                }
                catch (Exception e)
                {
                    logger.Log($"danmu socket send heartbeat error: {e.Message}");
                }
            }
        }

        public EventHandler<LiveChat> Chat;
        private async Task ReceiveData()
        {
            while (true)
            {
                try
                {
                    using var receive_stream = new MemoryStream();
                    var receive_buffer = WebSocket.CreateClientBuffer(8192, 8192);
                    WebSocketReceiveResult receive_result;
                    do
                    {
                        receive_result = await websocket.ReceiveAsync(receive_buffer, CancellationToken.None);
                        receive_stream.Write(receive_buffer.Array, receive_buffer.Offset, receive_result.Count);
                    } while (!receive_result.EndOfMessage);

                    receive_stream.Seek(0, SeekOrigin.Begin);
                    var raw_data = receive_stream.ToArray();
                    logger.Log($"danmu socket received {raw_data.Length} bytes");

                    if (raw_data[5] != 2)
                    {
                        logger.Log("danmu socket unknown protocol");
                        continue;
                    }

                    using var compressed_stream = new MemoryStream(raw_data, 16, raw_data.Length - 16);
                    using var gzip_stream = new GZipStream(compressed_stream, CompressionMode.Decompress);
                    using var gzip_reader = new StreamReader(gzip_stream);
                    var actual_data = await gzip_reader.ReadToEndAsync();
                    logger.Log($"danmu socket received {actual_data}");

                    Chat?.Invoke(this, new LiveChat { Content = actual_data });
                }
                catch (Exception e)
                {
                    logger.Log($"danmu socket receive data error: {e.Message}");
                }
            }
        }

        private int room_id;
        private ClientWebSocket websocket;
        public async Task Start(int room_id)
        {
            this.room_id = room_id;
            var (token, websocket_urls) = await getDanmuInfo();

            websocket = new ClientWebSocket();
            await websocket.ConnectAsync(new UriBuilder(websocket_urls[0]).Uri, CancellationToken.None);
            await websocket.SendAsync(CreateVerifyData(), WebSocketMessageType.Binary, false, CancellationToken.None);

            
#pragma warning disable CS4014 // Because this call is not awaited, execution of the current method continues before the call is completed
            SendHeartBeat();
            ReceiveData();
#pragma warning restore CS4014 // Because this call is not awaited, execution of the current method continues before the call is completed
        }
    }
}
