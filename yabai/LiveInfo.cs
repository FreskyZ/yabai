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
    internal class LiveInfo
    {
        private static readonly HttpClient http_client = new();

        public int RoomId { get; set; }
        public int RealId { get; set; }
        public bool Living { get; set; }
        public string LiveTitle { get; set; }
        public DateTime? StartTime { get; set; }
        public byte[] LiverAvatar { get; set; }
        public string LiverName { get; set; }

        public static async Task<LiveInfo> GetAsync(int room_id, Logger logger)
        {
            using var query = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["room_id"] = room_id.ToString(),
            });
            var response = await http_client.GetAsync(new UriBuilder
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

            var info = new LiveInfo { RoomId = room_id };
            string avatar_url = null;

            try
            {
                var document = await JsonDocument.ParseAsync(new MemoryStream(Encoding.UTF8.GetBytes(content)));
                var data = document.RootElement.GetProperty("data");

                info.RealId = data.prop("room_info").i32("room_id");
                info.Living = data.prop("room_info").i32("live_status") == 1;
                info.LiveTitle = data.prop("room_info").str("title");
                info.StartTime = data.prop("room_info").time("live_start_time");
                info.LiverName = data.prop("anchor_info").prop("base_info").str("uname");

                avatar_url = data.prop("anchor_info").prop("base_info").str("face");
            }
            catch (Exception e) when (e is JsonException
                || e is InvalidOperationException || e is KeyNotFoundException || e is IndexOutOfRangeException)
            {
                logger.Log($"GET {response.RequestMessage.RequestUri} failed to parse content");
                throw new InvalidOperationException("failed to get live info: failed to parse content");
            }

            if (avatar_url != null)
            {
                response = await http_client.GetAsync(avatar_url);
                if (!response.IsSuccessStatusCode)
                {
                    logger.Log($"GET {response.RequestMessage.RequestUri} failed with status {response.StatusCode}");
                }

                info.LiverAvatar = await response.Content.ReadAsByteArrayAsync();
                logger.Log($"GET {response.RequestMessage.RequestUri} content length {info.LiverAvatar.Length}");
            }

            return info;
        }
        public static async Task<string[]> GetStreamURLAsync(int real_id, Logger logger)
        {
            using var query = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["qn"] = "10000",   // video quality, 10000 for original quality
                ["platform"] = "web",
                ["ptype"] = "16",
                ["https_url_req"] = "1",
                ["cid"] = real_id.ToString(),
            });
            var response = await http_client.GetAsync(new UriBuilder
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
                throw new InvalidOperationException("failed to get room stream url: failed to parse content");
            }
        }
        public static async Task<(string token, string[] urls)> GetChatInfoAsync(int real_id, Logger logger)
        {
            using var query = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["type"] = "0",
                ["id"] = real_id.ToString(),
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
                throw new InvalidOperationException($"failed to get chat info: status {response.StatusCode}");
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
                throw new InvalidOperationException("failed to get chat info: failed to parse content");
            }
        }
    }
}
