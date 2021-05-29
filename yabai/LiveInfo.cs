using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Net.Http;
using System.Threading.Tasks;
using System.Linq;
using System.IO;
using System.Text;

namespace yabai
{
    internal struct LiveInfo
    {
        private static readonly HttpClient httpClient = new();

        public bool Living { get; init; }
        public DateTime StartTime { get; init; }
        public string LiveTitle { get; init; }
        public string LiverName { get; init; }
        public byte[] LiverAvatar { get; init; }
        public string[] StreamURLs { get; init; }

        private static async Task<(bool living, DateTime start, string title, string name, byte[] avatar)> GetRoomPlayInfo(int room_id, Logger logger)
        {
            using var query = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["room_id"] = room_id.ToString(),
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

            var living = false;
            var start_time = DateTime.UnixEpoch;
            string title = null;
            string name = null;
            string avatar_url = null;

            try
            {
                var document = await JsonDocument.ParseAsync(new MemoryStream(Encoding.UTF8.GetBytes(content)));
                var data = document.RootElement.GetProperty("data");

                living = data.prop("room_info").i32("live_status") == 1;
                start_time = data.prop("room_info").time("live_start_time");
                title = data.prop("room_info").str("title");
                name = data.prop("anchor_info").prop("base_info").str("uname");
                avatar_url = data.prop("anchor_info").prop("base_info").str("face");
            }
            catch (Exception e) when (e is JsonException
                || e is InvalidOperationException || e is KeyNotFoundException || e is IndexOutOfRangeException)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed to parse content");
                throw new InvalidOperationException("failed to get live info: failed to parse content");
            }

            byte[] avatar = null;
            if (avatar_url != null)
            {
                response = await httpClient.GetAsync(avatar_url);
                if (!response.IsSuccessStatusCode)
                {
                    logger.Log($"GET {response.RequestMessage.RequestUri} failed with status {response.StatusCode}");
                }

                avatar = await response.Content.ReadAsByteArrayAsync();
                logger.Log($"GET {response.RequestMessage.RequestUri} content length {avatar.Length}");

                if (avatar.Length == 0) // will this happen?
                {
                    avatar = null;
                }
            }

            return (living, start_time, title, name, avatar);
        }
        private static async Task<string[]> GetRoomPlayUrl(int room_id, Logger logger)
        {
            using var query = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["qn"] = "10000",   // video quality, 10000 for original quality
                ["platform"] = "web",
                ["ptype"] = "16",
                ["https_url_req"] = "1",
                ["cid"] = room_id.ToString(),
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
                return document.RootElement.prop("data").prop("durl")
                    .EnumerateArray().Select(durl => durl.str("url")).ToArray();
            }
            catch (Exception e) when (e is JsonException
                || e is InvalidOperationException || e is KeyNotFoundException || e is IndexOutOfRangeException)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed to parse content");
                throw new InvalidOperationException("failed to get live info: failed to parse content");
            }
        }
        public static async Task<LiveInfo> Load(int room_id, Logger logger)
        {
            // amazingly var [info, url] = await Task.WhenAll(task1, task2) is not in .net

            var info_task = GetRoomPlayInfo(room_id, logger);
            var url_task = GetRoomPlayUrl(room_id, logger);
            await Task.WhenAll(info_task, url_task);

            var (living, start, title, name, avatar) = await info_task;
            var urls = await url_task;
            return new LiveInfo { Living = living, StartTime = start, LiveTitle = title, LiverName = name, LiverAvatar = avatar, StreamURLs = urls };
        }
    }
}
