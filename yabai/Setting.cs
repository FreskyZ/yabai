using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

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
        [JsonPropertyName("room-id")]
        public int RoomId { get; set; } = 92613;
        [JsonPropertyName("room-history")]
        public RoomHistory[] RoomHistories { get; set; }
        [JsonPropertyName("fontsize")]
        public double FontSize { get; set; } = 16;
        [JsonPropertyName("alpha")]
        public byte BackgroundAlpha { get; set; } = 128;

        private const string FileName = "appsettings.json";
        public static Setting Load()
        {
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
