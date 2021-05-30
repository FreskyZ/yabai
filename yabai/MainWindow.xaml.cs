using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
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

        private readonly LiveChatClient chat_client;
        public MainWindow()
        {
            InitializeComponent();
            state = DataContext as MainWindowViewModel;

            logger = new Logger();
            chat_client = new LiveChatClient(logger);
            chat_client.StateChanged += (s, e) => state.SetChatState(e);
            chat_client.MessageReceived += handleMessageReceived;

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

            message_record_timer = new DispatcherTimer();
            message_record_timer.Interval = TimeSpan.FromMinutes(1);
            message_record_timer.Tick += handleFlushMessageRecord;
            message_record_timer.Start(); // this is simly always running and try to flush the stream writer
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
            // chat_client.StartDemo(); return;
            state.SetStreamURLs(await LiveInfo.GetStreamURLAsync(info.RealId, logger));
            comboboxLines.SelectedIndex = 0;

            var (token, chat_urls) = await LiveInfo.GetChatInfoAsync(info.RealId, logger);
            await chat_client.StartAsync(info.RealId, chat_urls[0], token);

            if (info.Living) 
            { 
                refresh_timer.Start(); 
            }

            if (message_record != null)
            {
                message_record.Flush();
                message_record.Dispose();
                message_record = null;
            }
            if (info.Living)
            {
                message_record = File.AppendText($"chat-{info.RoomId}-{info.StartTime:yyMMdd-HHmmss}.csv");
                message_record.WriteLine("time,member,price,user,content");
            }
        }

        private void handleScrollChange(object sender, ScrollChangedEventArgs e)
        {
            if (e.ExtentHeightChange > 0 && listboxchat.Items.Count > 0 && !state.LockScroll)
            {
                listboxchat.ScrollIntoView(listboxchat.Items[listboxchat.Items.Count - 1]);
            }
        }

        private StreamWriter message_record;
        private DispatcherTimer message_record_timer;
        private void handleMessageReceived(object sender, LiveChatMessage message)
        {
            state.AddMessage(message);
            if (message_record != null)
            {
                message_record.WriteLine($"{message.Time:yyMMdd-HHmmss},{message.MemberInfo},{message.Price},{message.UserName},\"{message.Content}\"");
            }
        }
        private void handleFlushMessageRecord(object sender, EventArgs e)
        {
            if (message_record != null)
            {
                message_record.Flush();
            }
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
// 3. log all messages to csv "time,user,content", try wordcloud, add replay csv
