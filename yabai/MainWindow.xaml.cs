using System;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace yabai
{
    public partial class MainWindow : Window
    {
        private static readonly Regex s_number = new(@"^\d+$");

        private readonly Logger logger;
        private readonly MainWindowViewModel state;
        public MainWindow()
        {
            InitializeComponent();
            InitializeChatPanel();
            state = DataContext as MainWindowViewModel;

            logger = new Logger();
            chat_client = new LiveChatClient(logger);
            chat_client.MessageReceived += handleChatMessageReceived;
            chat_client.StateChanged += (s, e) => state.SetChatState(e);

            // small event handlers
            textboxRoomId.PreviewTextInput += (s, e) => e.Handled = !s_number.IsMatch(e.Text);
            buttonOptions.Click += (s, e) => state.ToggleOptionsVisible();
            buttonCopyLine.Click += (s, e) => Clipboard.SetData(DataFormats.Text, state.StreamURLs[comboboxLines.SelectedIndex]);
            buttonOpenLine.Click += (s, e) => System.Diagnostics.Process.Start(state.MediaPlayer, $"\"{state.StreamURLs[comboboxLines.SelectedIndex]}\"");
            rectangleLiveStateTooltipProvider.ToolTipOpening += (s, e) => rectangleLiveStateTooltipProvider.ToolTip = state.LiveStateTooltip;

            // close
            buttonClose.Click += async (s, e) => { logger.Flush(); Cursor = Cursors.Wait; await chat_client.StopAsync(); Close(); };
            Application.Current.Exit += async (s, e) => { logger.Flush(); await chat_client.StopAsync(); };

            // fetch live info auto
            refresh_timer = new DispatcherTimer();
            refresh_timer.Interval = TimeSpan.FromMinutes(5);
            refresh_timer.Tick += handleRefreshInfo;
        }

        private DispatcherTimer refresh_timer;
        private async void handleRefreshInfo(object sender, EventArgs e)
        {
            var info = await LiveInfo.GetAsync(state.RoomId, logger);
            state.SetLiveInfo(info);
            if (!info.Living)
            {
                refresh_timer.Stop();
            }
        }
        private async void handleRefresh(object sender, RoutedEventArgs e)
        {
            refresh_timer.Stop();
            await chat_client.StopAsync();
            var info = await LiveInfo.GetAsync(state.RoomId, logger);

            state.SetLiveInfo(info);
            chat_client.StartDemo(); return;
            state.SetStreamURLs(await LiveInfo.GetStreamURLAsync(info.RealId, logger));
            comboboxLines.SelectedIndex = 0;

            var (token, chat_urls) = await LiveInfo.GetChatInfoAsync(info.RealId, logger);
            await chat_client.StartAsync(info.RealId, chat_urls[0], token);

            if (info.Living) { refresh_timer.Start(); }
        }

        private LiveChatItem[] chatitems;
        private int chatitemLastIndex;
        private readonly LiveChatClient chat_client;
        private void InitializeChatPanel()
        {
            chatitems = Enumerable.Range(0, 20).Select(_ =>
            {
                var textblock = new LiveChatItem { Visibility = Visibility.Hidden };
                textblock.MouseDown += (s, e) => DragMove();
                stackpanelChat.Children.Add(textblock);
                return textblock;
            }).ToArray();
            chatitemLastIndex = 0;
        }
        private void handleChatMessageReceived(object sender, LiveChatMessage message)
        {
            stackpanelChat.Children.Remove(chatitems[chatitemLastIndex]);

            chatitems[chatitemLastIndex].DataContext = message;
            chatitems[chatitemLastIndex].Visibility = Visibility.Visible;

            stackpanelChat.Children.Add(chatitems[chatitemLastIndex]);
            chatitemLastIndex = chatitemLastIndex == 19 ? 0 : chatitemLastIndex + 1;

            state.AddMessageCount();
            if (message.Content.Contains("草")) { state.AddWordCount("草", message.Content.Count(c => c == '草')); }
            if (message.Content.Contains("哈")) { state.AddWordCount("哈", message.Content.Count(c => c == '哈')); }
            if (message.Content.Contains("？") || message.Content.Contains("?")) { state.AddWordCount("？", message.Content.Count(c => c == '？' || c == '?')); }
        }

        private bool m_IsMouseDownSizer;
        private double m_SizerPrevX;
        private double m_SizerPrevY;
        private double m_PrevLeft, m_PrevTop;
        private double m_PrevWidth, m_PrevHeight;
        private void handleResizeHandleMouseDown(object sender, MouseButtonEventArgs e)
        {
            m_IsMouseDownSizer = true;
            (sender as Rectangle).CaptureMouse();

            var current_position = Native.GetCursorPosition();
            m_PrevTop = Top;
            m_PrevLeft = Left;
            m_PrevWidth = Width;
            m_PrevHeight = Height;
            m_SizerPrevX = current_position.X;
            m_SizerPrevY = current_position.Y;
        }
        private void handleResizeHandleMouseUp(object sender, MouseButtonEventArgs e)
        {
            m_IsMouseDownSizer = false;
            (sender as Rectangle).ReleaseMouseCapture();
        }
        private void handleResizeHandleMouseMove(object sender, MouseEventArgs e)
        {
            if (m_IsMouseDownSizer)
            {
                var current_position = Native.GetCursorPosition();
                double offx = current_position.X - m_SizerPrevX;
                double offy = current_position.Y - m_SizerPrevY;

                var tag = (sender as Rectangle).Tag as string;

                if (tag.Contains("left"))
                {
                    offx = (m_PrevWidth - offx) >= MinWidth
                        ? ((m_PrevWidth - offx) > MaxWidth ? (m_PrevWidth - MaxWidth) : offx)
                        : (m_PrevWidth - MinWidth);
                    Width = m_PrevWidth - offx;
                    Left = m_PrevLeft + offx;
                }
                if (tag.Contains("top"))
                {
                    offy = (m_PrevHeight - offy) >= MinHeight
                        ? ((m_PrevHeight - offy) > MaxHeight ? (m_PrevHeight - MaxHeight) : offy)
                        : (m_PrevHeight - MinHeight);
                    Top = m_PrevTop + offy;
                    Height = m_PrevHeight - offy;
                }
                if (tag.Contains("right"))
                {
                    offx = (m_PrevWidth + offx) >= MinWidth
                        ? ((m_PrevWidth + offx) > MaxWidth ? (MaxWidth - m_PrevWidth) : offx)
                        : (MinWidth - m_PrevWidth);
                    Width = m_PrevWidth + offx;
                }

                // bottom resize is not available currently, reserve it because it is complex to rethink the logic
                if (tag.Contains("bottom"))
                {
                    offy = (m_PrevHeight + offy) >= MinHeight
                        ? ((m_PrevHeight + offy) > MaxHeight ? (MaxHeight - m_PrevHeight) : offy)
                        : (MinHeight - m_PrevHeight);
                    Height = m_PrevHeight + offy;
                }
            }
        }
        private void handleDragMove(object sender, MouseEventArgs e)
        {
            DragMove();
        }
    }
}

// TODO:
// 1. change to ListBox and display all messages
// 2. display price
// 3. log all messages to csv "time,user,content", try wordcloud, add replay csv
// 4. improve IsMember logic
