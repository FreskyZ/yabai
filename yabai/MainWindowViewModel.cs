using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Data;
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

        private int room_id = 92613;
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

        private ObservableCollection<LiveChatMessage> messages = new ObservableCollection<LiveChatMessage>();
        private readonly Dictionary<string, int> word_count = new() { ["草"] = 0, ["哈"] = 0, ["？"] = 0 };
        public ObservableCollection<LiveChatMessage> Messages => messages;
        public string ChatStatistics { get => $"count {Messages.Count}, {string.Join(", ", word_count.Select(kv => $"{kv.Key}: {kv.Value}"))}"; }
        public void AddMessage(LiveChatMessage message)
        {
            messages.Add(message);
            if (message.Content.Contains("草")) { word_count["草"] += message.Content.Count(c => c == '草'); }
            if (message.Content.Contains("哈")) { word_count["哈"] += message.Content.Count(c => c == '哈'); }
            if (message.Content.Contains("？") || message.Content.Contains("?")) { word_count["？"] += message.Content.Count(c => c == '？' || c == '?'); }

            Notify(nameof(Messages));
            Notify(nameof(ChatStatistics));
        }

        private bool lock_scroll;
        public bool LockScroll { get => lock_scroll; set { lock_scroll = value; Notify(nameof(LockScroll)); } }

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

    public class NullCollapseConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => value == null ? Visibility.Collapsed : Visibility.Visible;
        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
    public class MinusSomethingConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => (double)value - double.Parse(parameter.ToString());
        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
    public class LiveChatMessageUserNameColorConverter : IValueConverter
    {
        private static readonly SolidColorBrush NormalColor = new SolidColorBrush(new Color { R = 0x60, G = 0x60, B = 0x60, A = 0xFF });
        private static readonly SolidColorBrush MemberColor = new SolidColorBrush(new Color { R = 0x5F, G = 0x8F, B = 0xEF, A = 0xDF });
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => (bool)value ? MemberColor : NormalColor;
        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
}
