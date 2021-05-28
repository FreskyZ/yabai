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
    internal struct LiveChatMessage
    {
        public DateTime Time { get; set; }
        public int? Price { get; init; } // not null for super chat
        public bool IsMember { get; init; } // is member in current room
        public string MemberInfo { get; init; } // selected displayed member and level
        public bool HasMemberInfo { get => MemberInfo != null; } // ui visibility
        public string UserName { get; init; }
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

        private async Task<(string token, string[] urls)> getChatInfo()
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

        private async Task SendVerify(string token)
        {
            try
            {
                if (websocket?.State == WebSocketState.Open)
                {
                    var payload = $"{{\"roomid\":{room_id},\"protover\":2,\"platform\":\"yabai\",\"key\":\"{token}\"}}";
                    var datapack_rest = new byte[] { 0, 16, 0, 1, 0, 0, 0, 7, 0, 0, 0, 1 }.Concat(Encoding.ASCII.GetBytes(payload)).ToArray();
                    var datapack = BitConverter.GetBytes(datapack_rest.Length + 4).Reverse().Concat(datapack_rest).ToArray();

                    logger.Log("send verify");
                    await websocket.SendAsync(datapack, WebSocketMessageType.Binary, true, CancellationToken.None);
                }
            }
            catch (Exception e)
            {
                logger.Log($"send verify error: {e.Message}");
                await Stop();
            }
        }

        private static readonly byte[] s_heartbeat = new byte[] { 0, 0, 0, 16, 0, 16, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1 };
        private async Task SendHeartbeat()
        {
            try
            {
                while (websocket.State == WebSocketState.Open)
                {
                    logger.Log("send heartbeat");
                    await websocket.SendAsync(s_heartbeat, WebSocketMessageType.Binary, true, CancellationToken.None);
                    await Task.Delay(30_000);
                }
            }
            catch (Exception e)
            {
                logger.Log($"send heartbeat error: {e.Message}");
                await Stop();
            }
        }

        public EventHandler<LiveChatMessage> MessageReceived;
        private void ReceiveMessage(JsonElement message)
        {
            try
            {
                var command = message.str("cmd");
                if (command == "DANMU_MSG")
                {
                    var info = message.prop("info");
                    MessageReceived?.Invoke(this, new LiveChatMessage
                    {
                        Time = info[9].time("ts"),
                        Price = null,
                        IsMember = info[2][2].i32() != 0 || !string.IsNullOrWhiteSpace(info[2][7].str()),
                        MemberInfo = info[3].len() > 0 ? $"{info[3][1].str()}{info[3][0].i32()}" : null,
                        UserName = info[2][1].str(),
                        Content = info[1].str(),
                    });
                }
                else if (command == "SUPER_CHAT_MESSAGE")
                {
                    var data = message.prop("data");
                    MessageReceived?.Invoke(this, new LiveChatMessage
                    {
                        Time = data.time("ts"),
                        Price = data.i32("price"),
                        IsMember = data.TryGetProperty("medal_info", out var medal_info)
                            && medal_info.TryGetProperty("guard_level", out var guard_level)
                            && guard_level.GetInt32() > 0,
                        MemberInfo = data.TryGetProperty("medal_info", out var medal_info2) ?
                            $"{medal_info2.str("medal_name")}{medal_info2.str("medal_level")}" : null,
                        UserName = data.prop("user_info").str("uname"),
                        Content = data.str("message"),
                    });
                }
            }
            catch (Exception e)
            {
                System.Diagnostics.Debug.WriteLine($"{e.Message}{e.StackTrace}{message}");
                logger.Log($"messasge parse error: {e.Message}: {message}");
            }
        }

        public EventHandler<string> StateChanged; // CHAT, NOT CHAT, ERROR
        private async Task ReceiveData()
        {
            try
            {
                while (websocket.State == WebSocketState.Open)
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
                    // logger.Log($"received {raw_data.Length} raw bytes");

                    var raw_payload = raw_data;
                    if (raw_data[7] == 2)
                    {
                        using var raw_payload_stream = new MemoryStream(raw_data, 18, raw_data.Length - 18);
                        using var deflate_stream = new DeflateStream(raw_payload_stream, CompressionMode.Decompress);
                        using var decompressed_stream = new MemoryStream();
                        deflate_stream.CopyTo(decompressed_stream);
                        raw_payload = decompressed_stream.ToArray();
                    }

                    var offset = 0;
                    while (offset < raw_payload.Length)
                    {
                        var chunk_header = raw_payload[offset..(offset + 16)];
                        var chunk_size = BitConverter.ToInt32(chunk_header.Take(4).Reverse().ToArray(), 0);
                        var chunk_payload = raw_payload[(offset + 16)..(offset + chunk_size)];

                        if (chunk_header[7] == 1 && chunk_header[11] == 3)
                        {
                            logger.Log("receive heartbeat response");
                        }
                        else
                        {
                            var chunk_data = JsonDocument.Parse(Encoding.UTF8.GetString(chunk_payload)).RootElement;
                            if (chunk_header[11] == 8)
                            {
                                var verify_success = chunk_data.GetProperty("code").GetInt32() == 0;
                                logger.Log(verify_success ? "receive verify success" : "receive verify fail");
                                StateChanged?.Invoke(this, "CHAT");
                            }
                            else
                            {
                                ReceiveMessage(chunk_data);
                            }
                        }
                        offset += chunk_size;
                    }
                }
            }
            catch (Exception e)
            {
                logger.Log($"receive data error: {e.Message}");
                await Stop();
            }
        }

        private int room_id;
        private ClientWebSocket websocket;
        public async Task Start(int room_id)
        {
            StateChanged?.Invoke(this, "NOT CHAT");

            this.room_id = room_id;
            var (token, websocket_urls) = await getChatInfo();

            websocket = new ClientWebSocket();
            await websocket.ConnectAsync(new UriBuilder(websocket_urls[0]).Uri, CancellationToken.None);
            await SendVerify(token);

            _ = Task.WhenAll(SendHeartbeat(), ReceiveData()).ConfigureAwait(false);
        }
        public async Task Stop()
        {
            if (websocket?.State == WebSocketState.Open)
            {
                try
                {
                    await websocket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
                }
                catch
                {
                    // ignore
                }
            }
            StateChanged?.Invoke(this, "NOT CHAT");
            websocket = null;
        }

        public void StartDemo()
        {
            MessageReceived?.Invoke(this, new LiveChatMessage
            {
                Time = DateTime.Now,
                IsMember = false,
                MemberInfo = "单腿人11",
                UserName = "用户名",
                Content = "弹幕消息11",
            });
            MessageReceived?.Invoke(this, new LiveChatMessage
            {
                Time = DateTime.Now,
                IsMember = true,
                MemberInfo = "单腿人21",
                UserName = "用户名2",
                Content = "弹幕消息12HENCHANGHENCHANGHENCHANGHENCHANGHENCHANG",
            });
            MessageReceived?.Invoke(this, new LiveChatMessage
            {
                Time = DateTime.Now,
                IsMember = false,
                MemberInfo = null,
                UserName = "user name 3",
                Content = "chat message 13",
            });
            MessageReceived?.Invoke(this, new LiveChatMessage
            {
                Time = DateTime.Now,
                IsMember = true,
                MemberInfo = null,
                UserName = "ユーザー名 ",
                Content = "ここすき１６长长长长 长长长长 长长长长长长长长 长长 长长 长长长长长长长长长长",
            });
        }
    }

    internal static class JsonHelper
    {
        public static JsonElement prop(this JsonElement self, string propertyName) => self.GetProperty(propertyName);
        public static int len(this JsonElement self) => self.GetArrayLength();
        public static int i32(this JsonElement self) => self.GetInt32();
        public static string str(this JsonElement self) => self.GetString();
        public static DateTime time(this JsonElement self) => DateTime.UnixEpoch.AddTicks(self.GetInt64() * TimeSpan.TicksPerSecond).ToLocalTime();
        public static int i32(this JsonElement self, string propertyName) => self.GetProperty(propertyName).GetInt32();
        public static string str(this JsonElement self, string propertyName) => self.GetProperty(propertyName).GetString();
        public static DateTime time(this JsonElement self, string propertyName) => DateTime.UnixEpoch.AddTicks(self.GetProperty(propertyName).GetInt64() * TimeSpan.TicksPerSecond).ToLocalTime();
    }
}
