using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace yabai
{
    public struct RoomHistory
    {
        [JsonPropertyName("room-id")]
        public int RoomId { get; set; }
        [JsonPropertyName("last-title")]
        public string LastTitle { get; set; }
    }

    internal class Setting
    {
        [JsonPropertyName("window-left")]
        public double WindowLeft { get; set; } = 100;
        [JsonPropertyName("window-top")]
        public double WindowTop { get; set; } = 100;
        [JsonPropertyName("window-width")]
        public double WindowWidth { get; set; } = 360;
        [JsonPropertyName("window-height")]
        public double WindowHeight { get; set; } = 400;
        [JsonPropertyName("topmost")]
        public bool TopMost { get; set; } = true;
        [JsonPropertyName("room-id")]
        public int RoomId { get; set; } = 92613;
        [JsonPropertyName("room-history")]
        public RoomHistory[] RoomHistories { get; set; } = Array.Empty<RoomHistory>();
        [JsonPropertyName("fontsize")]
        public double FontSize { get; set; } = 16;
        [JsonPropertyName("alpha")]
        public byte BackgroundAlpha { get; set; } = 128;
        [JsonPropertyName("merge")]
        public bool MergeMessages { get; set; } = true;
        [JsonPropertyName("media-player")]
        public string MediaPlayer { get; set; } = "wmplayer.exe";

        private static readonly string FolderName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "yabai");
        private static readonly string FileName = Path.Combine(FolderName, "settings.json");
        public static Setting Load()
        {
            if (!Directory.Exists(FolderName))
            {
                Directory.CreateDirectory(FolderName);
            }

            if (File.Exists(FileName))
            {
                var json = File.ReadAllText(FileName);
                return JsonSerializer.Deserialize<Setting>(json);
            }
            else
            {
                return new Setting();
            }
        }

        public void Save(MainWindow window)
        {
            WindowLeft = window.Left;
            WindowTop = window.Top;
            WindowWidth = window.Width;
            WindowHeight = window.Height;

            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(FileName, json);
        }
    }
}
