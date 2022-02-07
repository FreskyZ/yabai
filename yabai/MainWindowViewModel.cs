using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
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
        private Setting setting;
        internal void SetSetting(Setting setting)
        {
            this.setting = setting;

            this.fontsize = setting.FontSize;
            this.background_brush = CreateSolidColorBrush(setting.BackgroundAlpha);
            this.room_id = setting.RoomId;
            this.room_histories = new ObservableCollection<RoomHistory>(setting.RoomHistories);
            this.topmost = setting.TopMost;
            this.media_player = setting.MediaPlayer;
            this.merge_messages = setting.MergeMessages;

            Notify(nameof(FontSize));
            Notify(nameof(ChatBackgroundAlpha));
            Notify(nameof(ChatBackgroundColor));
            Notify(nameof(RoomIdText));
            Notify(nameof(RoomHistories));
            Notify(nameof(TopMost));
            Notify(nameof(MediaPlayer));
            Notify(nameof(MergeMessages));
        }

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
            Application.Current.MainWindow.Icon = icon; // data binding Window.Icon and Image.Icon to DataContext.Icon does not update application icon

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

        private bool options_visible = true; // initial visible to true
        private bool ignore_next_set; // strange, magic but very efficient method to prevent options to hide when manually set room id dropdown to hide
        public bool OptionsVisible { get => options_visible || !auto_scroll; set { if (ignore_next_set) { ignore_next_set = false; return; } options_visible = value; Notify(); } }

        private int room_id = 0;
        private ObservableCollection<RoomHistory> room_histories = new ObservableCollection<RoomHistory>();
        public int RoomId { get => room_id; set { room_id = value; if (setting != null) { setting.RoomId = value; } Notify(nameof(RoomIdText)); } }
        public string RoomIdText { get => room_id.ToString(); set { int.TryParse(value, out room_id); if (setting != null) { setting.RoomId = room_id; } Notify(); } }
        public ObservableCollection<RoomHistory> RoomHistories { get => room_histories; set { room_histories = new ObservableCollection<RoomHistory>(value.OrderBy(h => h.RoomId)); Notify(); } }
        private bool room_id_dropdown_visibility;
        public bool RoomIdDropdownVisibility { get => room_id_dropdown_visibility; set { room_id_dropdown_visibility = value; Notify(); } }
        public SimpleCommand<int> SelectRoomIdCommand { get; set; }
        public SimpleCommand<RoomHistory> DeleteRoomIdCommand { get; set; }
        public MainWindowViewModel()
        {
            SelectRoomIdCommand = new SimpleCommand<int>(HandleSelectRoomId);
            DeleteRoomIdCommand = new SimpleCommand<RoomHistory>(HandleDeleteRoomId);
        }
        public event EventHandler<RoutedEventArgs> RoomIdSelected;
        private void HandleSelectRoomId(object sender, int roomId)
        {
            RoomId = roomId;
            RoomIdDropdownVisibility = false;
            ignore_next_set = true;
            RoomIdSelected?.Invoke(this, new RoutedEventArgs());
        }
        private void HandleDeleteRoomId(object sender, RoomHistory entry)
        {
            RoomHistories.Remove(entry);
            Notify(nameof(RoomHistories));
            setting.RoomHistories = RoomHistories.ToArray();
        }
        public void UpdateRoomHistory(int roomId, string lastTitle)
        {
            var history_entry = RoomHistories.FirstOrDefault(h => h.RoomId == info.RoomId);
            if (history_entry.LastTitle != null)
            {
                // you cannot update inplace because it is a struct while findIndex is not available
                RoomHistories.Remove(history_entry);
            }
            RoomHistories.Add(new RoomHistory { RoomId = info.RoomId, LastTitle = $"{info.LiveTitle} - {info.LiverName}" });
            RoomId = RoomId;
            RoomHistories = RoomHistories; // notify and reorder
            setting.RoomHistories = RoomHistories.ToArray();
        }

        private string[] stream_urls = new string[0];
        public string[] StreamURLs => stream_urls;
        public string[] StreamURLNames => stream_urls.Select((_, index) => $"Line {index + 1}").ToArray();
        public bool StreamURLButtonEnabled => stream_urls.Length > 0;

        private DateTime stream_url_expire = DateTime.UnixEpoch;
        private string last_used_url;
        public DateTime StreamURLExpire => stream_url_expire;
        public string LastUsedStreamURL { get => last_used_url; set { last_used_url = value; Notify(nameof(IconBadgeVisibility)); } } // indicate user when last used url is not in current url list
        public Visibility IconBadgeVisibility => icon != null && LastUsedStreamURL != null && !StreamURLs.Contains(LastUsedStreamURL) ? Visibility.Visible : Visibility.Collapsed;

        private string media_player = "wmplayer.exe";
        public string MediaPlayer { get => media_player; set { media_player = value; if (setting != null) { setting.MediaPlayer = value; } Notify(); } }
        public void SetStreamURLs((string[] urls, DateTime expire) u)
        {
            this.stream_urls = u.urls;
            this.stream_url_expire = u.expire;

            Notify(nameof(StreamURLNames));
            Notify(nameof(StreamURLButtonEnabled));
            Notify(nameof(IconBadgeVisibility));
        }

        private bool merge_messages = true;
        public bool MergeMessages { get => merge_messages; set { merge_messages = value; if (setting != null) { setting.MergeMessages = value; } Notify(); } }
        private ObservableCollection<DisplayChatMessage> messages = new ObservableCollection<DisplayChatMessage>();
        public ObservableCollection<DisplayChatMessage> Messages => messages;
        public void SetMessages(DisplayChatMessage[] histories)
        {
            // this does not have merge message
            messages = new ObservableCollection<DisplayChatMessage>(histories);
            Notify(nameof(Messages));
        }
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

            // archived message content is exactly received, but display message can trim
            display.Content = display.Content.Trim();

            // merge ascii and full width question mark and exclamation mark
            display.Content = display.Content.Replace('?', '？').Replace('!', '！');

            if (merge_messages)
            {
                // 6 characters of repeated sequence accepts $"\{4-char name vup singing}/"
                foreach (var sequence_length in Enumerable.Range(1, 6))
                {
                    if (display.Content.Length > sequence_length && display.Content.Length % sequence_length == 0)
                    {
                        var sequence = display.Content[0..sequence_length];
                        if (display.Content == string.Concat(Enumerable.Repeat(sequence, display.Content.Length / sequence_length)))
                        {
                            display.Content = sequence;
                            display.Count = display.Content.Length / sequence_length;
                        }
                    }
                }

                // fold /2333+/ to 233 x folded count of 3, 233 is 233x1, 2333 is 233x2, 23333 is 233x3
                if (display.Content.StartsWith("233") && display.Content[3..].All(c => c == '3'))
                {
                    display.Count = display.Content.Length - 2;
                    display.Content = "233";
                }
                // fold /oh+/ to oh x folded count of h
                else if (display.Content.StartsWith("oh") && display.Content[2..].All(c => c == 'h'))
                {
                    display.Count = display.Content.Length - 1;
                    display.Content = "oh";
                }

                // check duplicate with previous 16 messages
                foreach (var previous in messages.Reverse().Take(16))
                {
                    if (StringComparer.CurrentCultureIgnoreCase.Equals(display.Content, previous.Content))
                    {
                        previous.Count += display.Count;
                        Notify(nameof(Messages));
                        return;
                    }
                }
            }

            messages.Add(display);
            Notify(nameof(Messages));
        }

        private bool auto_scroll = true;
        public bool AutoScroll { get => auto_scroll; set { auto_scroll = value; Notify(); Notify(nameof(OptionsVisible)); } }

        private bool display_super_chat = true;
        private bool display_normal_chat = true;
        private static Dictionary<(bool super, bool normal), Predicate<object>> Filters = new()
        {
            [(true, true)] = v => true,
            [(false, false)] = v => false,
            [(true, false)] = v => v is DisplayChatMessage m && m.Price != null,
            [(false, true)] = v => v is DisplayChatMessage m && m.Price == null,
        };
        public CollectionView ChatContainerView { get; set; }
        public bool DisplaySuperChat { get => display_super_chat; set { display_super_chat = value; Notify(); ChatContainerView.Filter = Filters[(display_super_chat, display_normal_chat)]; } }
        public bool DisplayNormalChat { get => display_normal_chat; set { display_normal_chat = value; Notify(); ChatContainerView.Filter = Filters[(display_super_chat, display_normal_chat)]; } }

        private double fontsize = 16;
        public double FontSize { get => fontsize; set { fontsize = value; if (setting != null) { setting.FontSize = value; } Notify(nameof(FontSize)); } }

        private SolidColorBrush background_brush = CreateSolidColorBrush(0x9F);
        private static SolidColorBrush CreateSolidColorBrush(byte alpha) => new SolidColorBrush(new Color { R = 0xCF, G = 0xCF, B = 0xCF, A = alpha });
        public SolidColorBrush ChatBackgroundColor => background_brush;
        public byte ChatBackgroundAlpha { get => background_brush.Color.A; set { background_brush = CreateSolidColorBrush(value); if (setting != null) { setting.BackgroundAlpha = value; }  Notify(); Notify(nameof(ChatBackgroundColor)); } }

        private bool topmost = true;
        public bool TopMost { get => topmost; set { topmost = value; if (setting != null) { setting.TopMost = value; } Notify(); } }

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
    public class ChatColorConverter : IMultiValueConverter
    {
        private static readonly SolidColorBrush Transparent = new SolidColorBrush(Colors.Transparent);
        private static readonly SolidColorBrush NormalColor = new SolidColorBrush(new Color { R = 0x5F, G = 0x8F, B = 0xCF, A = 0xFF });
        private static readonly SolidColorBrush SuperColor = new SolidColorBrush(Colors.Orange);
        public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture) => values[0] != null ? SuperColor : (byte)values[1] == 0 ? Transparent : NormalColor;
        public object[] ConvertBack(object value, Type[] targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
    public class RoomIdRule: ValidationRule
    {
        public override ValidationResult Validate(object value, CultureInfo cultureInfo)
        {
            return int.TryParse(value as string, out var _) ? ValidationResult.ValidResult : new ValidationResult(false, "room id can only be number");
        }
    }
    public class SimpleCommand<T> : ICommand
    {
        public event EventHandler CanExecuteChanged;
        private readonly EventHandler<T> handler;
        public SimpleCommand(EventHandler<T> handler) => this.handler = handler;
        public bool CanExecute(object parameter) => true;
        public void Execute(object parameter) => this.handler(null, (T)parameter);
    }
}
