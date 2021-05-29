using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace yabai
{
    public class MainWindowViewModel : INotifyPropertyChanged
    {
        private LiveInfo info;
        private ImageSource icon;
        public ImageSource Icon { get => icon; }
        public string WindowTitle => info == null ? null : $"{info.LiveTitle} - {info.LiverName}";
        public string WindowTitleTooltip => info == null ? null : $"{info.LiveTitle} - {info.LiverName} ({info.RoomId}{(info.RoomId == info.RealId ? "" : $"({info.RealId})")})";
        public string ApplicationTitle => info == null ? "yabai" : $"{info.LiveTitle} - {info.LiverName} - yabai";
        public string LiveState => info?.Living == true ? "LIVE" : "NOT LIVE";
        public string LiveStateTooltip => info == null || !info.Living ? "NOT LIVE" : info.StartTime == null ? "LIVE" : $"LIVE {DateTime.Now - info.StartTime:hh\\:mm\\:ss}";
        internal void SetLiveInfo(LiveInfo info)
        {
            this.info = info;
            icon = ConvertToImage(info.LiverAvatar);

            Notify(nameof(Icon));
            Notify(nameof(WindowTitle));
            Notify(nameof(WindowTitleTooltip));
            Notify(nameof(ApplicationTitle));
            Notify(nameof(LiveState));
            Notify(nameof(LiveStateTooltip));
            Notify(nameof(LiveChatIconWidth));
        }

        private string chat_state = "NOT CHAT";
        public string ChatState => chat_state;
        public string ChatStateTooltip => chat_state == "NOT CHAT" ? "CHAT SERVER NOT CONNECTED" : chat_state == "CHAT" ? "CHAT SERVER CONNECTED" : "CHAT SERVER CONNECT ERROR";
        public double LiveChatIconWidth => LiveState == "NOT LIVE" || ChatState == "NOT CHAT" ? 110 : 84;
        public void SetChatState(string chat_state)
        {
            this.chat_state = chat_state;

            Notify(nameof(ChatState));
            Notify(nameof(ChatStateTooltip));
            Notify(nameof(LiveChatIconWidth));
        }

        private bool options_visible;
        public bool OptionsVisible => options_visible;
        public void ToggleOptionsVisible()
        {
            options_visible = !options_visible;
            Notify(nameof(OptionsVisible));
        }

        private int room_id = 116;
        public int RoomId => room_id;
        public string RoomIdText { get => room_id.ToString(); set { room_id = int.Parse(value); Notify(); } }

        private string[] stream_urls = new string[0];
        private string media_player = @"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe";
        public string[] StreamURLs => stream_urls;
        public string[] StreamURLNames => stream_urls.Select((_, index) => $"Line {index + 1}").ToArray();
        public bool StreamURLButtonEnabled => stream_urls.Length > 0;
        public string MediaPlayer { get => media_player; set { media_player = value; Notify(); } }
        public void SetStreamURLs(string[] stream_urls)
        {
            this.stream_urls = stream_urls;

            Notify(nameof(StreamURLNames));
            Notify(nameof(StreamURLButtonEnabled));
            Notify(nameof(MediaPlayer));
        }

        private int message_count;
        private readonly Dictionary<string, int> word_count = new() { ["草"] = 0, ["哈"] = 0, ["？"] = 0 };
        public string ChatStatistics { get => $"count {message_count}, {string.Join(", ", word_count.Select(kv => $"{kv.Key}: {kv.Value}"))}"; }
        public void AddMessageCount(int count = 1)
        {
            message_count += count;
            Notify(nameof(ChatStatistics));
        }
        public void AddWordCount(string word, int count = 1)
        {
            if (word_count.ContainsKey(word))
            {
                word_count[word] += count;
                Notify(nameof(ChatStatistics));
            }
        }

        public event PropertyChangedEventHandler PropertyChanged;
        public void Notify([CallerMemberName] string propertyName = "")
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        private static BitmapImage ConvertToImage(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0)
            {
                return null;
            }

            var image = new BitmapImage();
            using var stream = new MemoryStream(bytes);
            stream.Seek(0, SeekOrigin.Begin);

            image.BeginInit();
            image.UriSource = null;
            image.StreamSource = stream;
            image.CreateOptions = BitmapCreateOptions.PreservePixelFormat;
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.EndInit();
            image.Freeze();

            return image;
        }
    }
}
