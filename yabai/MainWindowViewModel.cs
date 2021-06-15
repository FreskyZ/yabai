using System;
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
    public class DisplayChatMessage : INotifyPropertyChanged
    {
        public string Price { get; set; }
        public string UserName { get; set; }
        public string Content { get; set; }
        public long TimeStamp { get; set; }

        private int count = 1;
        public int Count { get => count; set { count = value; Notify(nameof(CountString)); } }
        public string CountString => count > 1 ? $"×{count}" : "";
        
        public event PropertyChangedEventHandler PropertyChanged;
        public void Notify([CallerMemberName] string propertyName = "")
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

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
        public void HideOptions()
        {
            options_visible = false;
            Notify(nameof(OptionsVisible));
        }
        public void ToggleOptionsVisible()
        {
            options_visible = !options_visible;
            Notify(nameof(OptionsVisible));
        }

        private int room_id = 92613;
        public int RoomId => room_id;
        public string RoomIdText { get => room_id.ToString(); set { room_id = int.Parse(value); Notify(); } }

        private string[] stream_urls = new string[0];
        private DateTime stream_url_expire = DateTime.UnixEpoch;
        private string media_player = @"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe";
        public string[] StreamURLs => stream_urls;
        public DateTime StreamURLExpire => stream_url_expire;
        public string StreamURLExpireString => $"expires {stream_url_expire:HH\\:ss}";
        public string[] StreamURLNames => stream_urls.Select((_, index) => $"Line {index + 1}").ToArray();
        public bool StreamURLButtonEnabled => stream_urls.Length > 0;
        public string MediaPlayer { get => media_player; set { media_player = value; Notify(); } }
        public void SetStreamURLs((string[] urls, DateTime expire) u)
        {
            this.stream_urls = u.urls;
            this.stream_url_expire = u.expire;

            Notify(nameof(StreamURLExpireString));
            Notify(nameof(StreamURLNames));
            Notify(nameof(StreamURLButtonEnabled));
            Notify(nameof(MediaPlayer));
        }

        private ObservableCollection<DisplayChatMessage> messages = new ObservableCollection<DisplayChatMessage>();
        public ObservableCollection<DisplayChatMessage> Messages => messages;
        public void AddMessage(LiveChatMessage message)
        {
            // check self repeated [1, 4] characters
            var display = new DisplayChatMessage
            {
                Price = message.Price,
                UserName = message.UserName,
                Content = message.Content,
                TimeStamp = message.TimeStamp,
            };

            if (display.Content.Length > 1)
            {
                foreach (var sequence_length in Enumerable.Range(1, 4))
                {
                    if (display.Content.Length % sequence_length == 0)
                    {
                        var sequence = display.Content[0..sequence_length];
                        if (display.Content == string.Concat(Enumerable.Repeat(sequence, display.Content.Length / sequence_length)))
                        {
                            display.Content = sequence;
                            display.Count = display.Content.Length / sequence_length;
                        }
                    }
                }
            }
            
            // check duplicate with previous 15 messages
            foreach (var previous in messages.Reverse().Take(15))
            {
                if (StringComparer.CurrentCultureIgnoreCase.Equals(display.Content, previous.Content))
                {
                    previous.Count += display.Count;
                    Notify(nameof(Messages));
                    return;
                }
            }

            messages.Add(display);
            Notify(nameof(Messages));
        }

        private bool auto_scroll = true;
        public bool AutoScroll { get => auto_scroll; set { auto_scroll = value; Notify(nameof(AutoScroll)); } }

        private double fontsize = 16;
        public double FontSize { get => fontsize; set { fontsize = value; Notify(nameof(FontSize)); } }

        private byte background_alpha = 0x9F;
        private SolidColorBrush background_brush = new SolidColorBrush(new Color { R = 0xCF, G = 0xCF, B = 0xCF, A = 0x9F });
        public SolidColorBrush ChatBackgroundColor => background_brush; 
        public byte ChatBackgroundAlpha
        {
            get => background_alpha;
            set
            {
                background_alpha = value;
                background_brush = new SolidColorBrush(new Color { R = 0xCF, G = 0xCF, B = 0xCF, A = value }); Notify(); Notify(nameof(ChatBackgroundColor));
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

    public class NullCollapseConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => value == null ? Visibility.Collapsed : Visibility.Visible;
        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
    public class MessageColorConverter : IValueConverter
    {
        private static readonly SolidColorBrush NormalColor = new SolidColorBrush(new Color { R = 0x5F, G = 0x8F, B = 0xCF, A = 0xFF });
        private static readonly SolidColorBrush SuperColor = new SolidColorBrush(Colors.Orange);
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => value != null ? SuperColor : NormalColor;
        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
}
