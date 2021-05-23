using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Net.Http;
using System.Threading.Tasks;
using System.Linq;
using System.IO;
using System.Text;

namespace SGMonitor
{
    internal class LiveInfo
    {
        private static readonly HttpClient httpClient = new();
        // see https://github.com/Passkou/bilibili-api/blob/main/bilibili_api/data/api.json

        private readonly Logger logger;
        public LiveInfo(Logger logger)
        {
            this.logger = logger;

            StartTime = DateTime.UnixEpoch;
        }

        public int RoomId { get; set; }
        public bool Living { get; private set; }
        public DateTime StartTime { get; private set; }
        public string LiveTitle { get; private set; }
        public string LiverName { get; private set; }
        public byte[] LiverAvatar { get; private set; }
        public string[] StreamURLs { get; private set; }

        private async Task GetRoomPlayInfo()
        {
            Living = false;
            StartTime = DateTime.UnixEpoch;
            LiveTitle = null;
            LiverName = null;
            LiverAvatar = null;

            using var query = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["room_id"] = RoomId.ToString(),
            });
            var response = await httpClient.GetAsync(new UriBuilder
            {
                Scheme = "https",
                Host = "api.live.bilibili.com",
                Path = "/xlive/web-room/v1/index/getInfoByRoom",
                Query = await query.ReadAsStringAsync(),
            }.Uri);

            if (!response.IsSuccessStatusCode)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed with status {response.StatusCode}");
                throw new InvalidOperationException($"failed to get live info: status {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();
            logger.Log($"GET {response.RequestMessage.RequestUri} content {content}");

            string avatarURL = null;
            try
            {
                var document = await JsonDocument.ParseAsync(new MemoryStream(Encoding.UTF8.GetBytes(content)));
                var data = document.RootElement.GetProperty("data");

                Living = data.GetProperty("room_info").GetProperty("live_status").GetInt32() == 1;
                StartTime = DateTime.UnixEpoch.AddTicks(data.GetProperty("room_info").GetProperty("live_start_time").GetInt64() * TimeSpan.TicksPerSecond);
                LiveTitle = data.GetProperty("room_info").GetProperty("title").GetString();
                LiverName = data.GetProperty("anchor_info").GetProperty("base_info").GetProperty("uname").GetString();
                avatarURL = data.GetProperty("anchor_info").GetProperty("base_info").GetProperty("face").GetString();
            }
            catch (Exception e) when (e is JsonException 
                || e is InvalidOperationException || e is KeyNotFoundException || e is IndexOutOfRangeException)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed to parse content");
                throw new InvalidOperationException("failed to get live info: failed to parse content");
            }

            if (avatarURL != null)
            {
                response = await httpClient.GetAsync(avatarURL);
                if (!response.IsSuccessStatusCode)
                {
                    logger.Log($"GET {response.RequestMessage.RequestUri} failed with status {response.StatusCode}");
                }

                LiverAvatar = await response.Content.ReadAsByteArrayAsync();
                logger.Log($"GET {response.RequestMessage.RequestUri} content length {LiverAvatar.Length}");

                if (LiverAvatar.Length == 0) // will this happen?
                {
                    LiverAvatar = null;
                }
            }
        }
        private async Task GetRoomPlayUrl()
        {
            StreamURLs = new string[0];

            using var query = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["qn"] = "10000",   // video quality, 10000 for original quality
                ["platform"] = "web",
                ["ptype"] = "16",
                ["https_url_req"] = "1",
                ["cid"] = RoomId.ToString(),
            });
            var response = await httpClient.GetAsync(new UriBuilder
            {
                Scheme = "https",
                Host = "api.live.bilibili.com",
                Path = "/xlive/web-room/v1/playUrl/playUrl",
                Query = await query.ReadAsStringAsync(),
            }.Uri);

            if (!response.IsSuccessStatusCode)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed with status {response.StatusCode}");
                throw new InvalidOperationException($"failed to get live url: status {response.StatusCode}");
            }

            var content = await response.Content.ReadAsStringAsync();
            logger.Log($"GET {response.RequestMessage.RequestUri} content {content}");

            try
            {
                var document = await JsonDocument.ParseAsync(new MemoryStream(Encoding.UTF8.GetBytes(content)));
                var data = document.RootElement.GetProperty("data");

                StreamURLs = data.GetProperty("durl")
                    .EnumerateArray().Select(durl => durl.GetProperty("url").GetString()).ToArray();
            }
            catch (Exception e) when (e is JsonException
                || e is InvalidOperationException || e is KeyNotFoundException || e is IndexOutOfRangeException)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed to parse content");
                throw new InvalidOperationException("failed to get live info: failed to parse content");
            }
        }
        public async Task Refresh()
        {
            await Task.WhenAll(GetRoomPlayInfo(), GetRoomPlayUrl());
        }
    }
}
