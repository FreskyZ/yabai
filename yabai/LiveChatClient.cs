using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace yabai
{
    public struct LiveChatMessage
    {
        public long TimeStamp { get; init; }
        public string Price { get; init; } // not null for super chat
        public bool IsMember { get; init; } // is member in current room
        public string MemberInfo { get; init; } // selected displayed member and level
        public string UserName { get; init; }
        public string Content { get; init; }
    }

    internal class LiveChatClient
    {
        private readonly Logger logger;
        public LiveChatClient(Logger logger)
        {
            this.logger = logger;
        }

        private async Task SendVerifyAsync(string token)
        {
            try
            {
                if (websocket?.State == WebSocketState.Open)
                {
                    var payload = $"{{\"roomid\":{real_id},\"protover\":2,\"platform\":\"yabai\",\"key\":\"{token}\"}}";
                    var datapack_rest = new byte[] { 0, 16, 0, 1, 0, 0, 0, 7, 0, 0, 0, 1 }.Concat(Encoding.ASCII.GetBytes(payload)).ToArray();
                    var datapack = BitConverter.GetBytes(datapack_rest.Length + 4).Reverse().Concat(datapack_rest).ToArray();

                    logger.Log("send verify");
                    await websocket.SendAsync(datapack, WebSocketMessageType.Binary, true, CancellationToken.None);
                }
            }
            catch (Exception e)
            {
                logger.Log($"send verify error: {e.Message}");
                await StopAsync();
            }
        }

        private static readonly byte[] heartbeat_datapack = new byte[] { 0, 0, 0, 16, 0, 16, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1 };
        private async Task SendHeartbeatAsync()
        {
            var cancel_token = heartbeat_source.Token;
            try
            {
                while (websocket?.State == WebSocketState.Open && !cancel_token.IsCancellationRequested)
                {
                    logger.Log("send heartbeat");
                    await websocket.SendAsync(heartbeat_datapack, WebSocketMessageType.Binary, true, cancel_token);
                    await Task.Delay(30_000);
                }
            }
            catch (TaskCanceledException)
            {
                // ignore
            }
            catch (Exception e)
            {
                logger.Log($"send heartbeat error: {e.Message}");
                await StopAsync();
            }
        }

        public EventHandler<LiveChatMessage> MessageReceived;
        private void ProcessMessage(JsonElement message)
        {
            try
            {
                var command = message.str("cmd");
                if (command == "DANMU_MSG")
                {
                    var info = message.prop("info");
                    MessageReceived?.Invoke(this, new LiveChatMessage
                    {
                        TimeStamp = info[9].i64("ts"),
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
                        TimeStamp = data.i64("ts"),
                        Price = $"\uFFE5{data.i32("price")}",
                        IsMember = data.TryGetProperty("medal_info", out var medal_info)
                            && medal_info.TryGetProperty("guard_level", out var guard_level)
                            && guard_level.i32() > 0 || medal_info.i32("anchor_roomid") == real_id,
                        MemberInfo = data.TryGetProperty("medal_info", out var medal_info2) ?
                            $"{medal_info2.str("medal_name")}{medal_info2.i32("medal_level")}" : null,
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
        private async Task ReceiveAsync()
        {
            var cancel_token = receive_source.Token;
            try
            {
                while (websocket.State == WebSocketState.Open && !cancel_token.IsCancellationRequested)
                {
                    using var receive_stream = new MemoryStream();
                    var receive_buffer = WebSocket.CreateClientBuffer(8192, 8192);
                    WebSocketReceiveResult receive_result;
                    do
                    {
                        receive_result = await websocket.ReceiveAsync(receive_buffer, cancel_token);
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
                                ProcessMessage(chunk_data);
                            }
                        }
                        offset += chunk_size;
                    }
                }
            }
            catch (TaskCanceledException)
            {
                // ignore
            }
            catch (Exception e)
            {
                logger.Log($"receive data error: {e.Message}");
                await StopAsync();
            }
        }

        private int real_id;
        private ClientWebSocket websocket;
        private CancellationTokenSource receive_source;
        private CancellationTokenSource heartbeat_source;
        public async Task StartAsync(int real_id, string chat_server, string token)
        {
            this.real_id = real_id;
            StateChanged?.Invoke(this, "NOT CHAT");

            websocket = new ClientWebSocket();
            await websocket.ConnectAsync(new Uri(chat_server), CancellationToken.None);
            await SendVerifyAsync(token);

            receive_source = new CancellationTokenSource();
            heartbeat_source = new CancellationTokenSource();
            _ = Task.WhenAll(SendHeartbeatAsync(), ReceiveAsync()).ConfigureAwait(false);
        }
        public async Task StopAsync()
        {
            if (websocket?.State == WebSocketState.Open)
            {
                heartbeat_source.Cancel();
                var timeout = new CancellationTokenSource(1_000); // 1 second

                try
                {
                    await websocket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Closing", timeout.Token);
                    while (websocket.State != WebSocketState.Closed && !timeout.Token.IsCancellationRequested) ;
                }
                catch
                {
                    // ignore TaskCancelException and other exceptions
                }
                receive_source.Cancel();
            }

            StateChanged?.Invoke(this, "NOT CHAT");
            if (websocket != null)
            {
                websocket.Dispose();
                websocket = null;
            }

            replay_timer?.Dispose();
        }

        private Timer replay_timer;
        public void Replay(string filename)
        {
            var index = 0;
            var lines = File.ReadAllLines(filename);
            var rng = new Random();

            replay_timer = new Timer(s =>
            {
                foreach (var _ in Enumerable.Range(0, rng.Next(1, 6)))
                {
                    if (index < lines.Length)
                    {
                        var message = lines[index].Split(',');
                        var username = message[3];
                        var content = message[4].Trim('"');
                        MessageReceived?.Invoke(this, new LiveChatMessage
                        {
                            TimeStamp = 0,
                            UserName = username,
                            Content = content,
                        });
                        index += 1;
                    }
                }
            }, null, TimeSpan.FromMilliseconds(1000), TimeSpan.FromMilliseconds(1000));
        }
    }

    internal static class JsonHelper
    {
        public static JsonElement prop(this JsonElement self, string propertyName) => self.GetProperty(propertyName);
        public static int len(this JsonElement self) => self.GetArrayLength();
        public static int i32(this JsonElement self) => self.GetInt32();
        public static long i64(this JsonElement self) => self.GetInt64();
        public static string str(this JsonElement self) => self.GetString();
        public static int i32(this JsonElement self, string propertyName) => self.GetProperty(propertyName).GetInt32();
        public static long i64(this JsonElement self, string propertyName) => self.GetProperty(propertyName).GetInt64();
        public static string str(this JsonElement self, string propertyName) => self.GetProperty(propertyName).GetString();

        public static DateTime ToDateTime(this long self) => DateTime.UnixEpoch.AddTicks(self * TimeSpan.TicksPerSecond).ToLocalTime();
    }
}
