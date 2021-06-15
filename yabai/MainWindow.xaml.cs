using Microsoft.Win32;
using System;
using System.IO;
using System.Text.RegularExpressions;
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

        private readonly DispatcherTimer base_timer; // 1 min timer for log flush, record flush, live info refresh and possible stream url refresh
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
            headercontainer.MouseLeave += (s, e) => state.HideOptions();

            // close
            buttonClose.Click += async (s, e) => { logger.Flush(); Cursor = Cursors.Wait; await chat_client.StopAsync(); Close(); };
            Application.Current.Exit += async (s, e) => { logger.Flush(); await chat_client.StopAsync(); };

            // fetch live info auto
            base_timer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(1) };
            base_timer.Tick += handleBaseTimer;
            base_timer.Start();
        }

        private async void handleBaseTimer(object sender, EventArgs e)
        {
            logger.Flush();
            message_record?.Flush(); 

            var info = await LiveInfo.GetAsync(state.RoomId, logger);
            state.SetLiveInfo(info);

            if (info.Living && state.StreamURLExpire != DateTime.UnixEpoch && state.StreamURLExpire - DateTime.Now < TimeSpan.FromMinutes(10))
            {
                state.SetStreamURLs(await LiveInfo.GetStreamURLAsync(info.RealId, logger));
            }
        }
        private async void handleRefreshAll(object sender, RoutedEventArgs e)
        {
            // chat_client.StartDemo(); return;
            await chat_client.StopAsync();
            var info = await LiveInfo.GetAsync(state.RoomId, logger);

            state.SetLiveInfo(info);
            state.SetStreamURLs(await LiveInfo.GetStreamURLAsync(info.RealId, logger));
            comboboxLines.SelectedIndex = 0;

            var (token, chat_urls) = await LiveInfo.GetChatInfoAsync(info.RealId, logger);
            await chat_client.StartAsync(info.RealId, chat_urls[0], token);

            if (message_record != null)
            {
                message_record.Flush();
                message_record.Dispose();
                message_record = null;
            }
            if (info.Living)
            {
                var filename = $"chat-{info.RoomId}-{info.StartTime:yyMMdd-HHmmss}.csv";
                var exists = File.Exists(filename);
                message_record = File.AppendText(filename);
                if (!exists)
                {
                    message_record.WriteLine("time,member,price,user,content");
                }
            }
        }

        private void handleSetMediaPlayer(object sender, RoutedEventArgs e)
        {
            var dialog = new OpenFileDialog { Filter = "Executable files (*.exe)|*.exe|All files (*.*)|*.*" };
            if (dialog.ShowDialog() == true)
            {
                state.MediaPlayer = dialog.FileName;
            }
        }
        private void handleScrollChange(object sender, ScrollChangedEventArgs e)
        {
            if (e.ExtentHeightChange > 0 && chatcontainer.Items.Count > 0 && state.AutoScroll)
            {
                chatcontainer.ScrollIntoView(chatcontainer.Items[chatcontainer.Items.Count - 1]);
            }

            // normally displays at [vertical offset / extent height, (vertical offset + viewport height) / extent height] * container height
            // min display height is 40px, if less, expand to 2 directions

            var basic_top = e.VerticalOffset / e.ExtentHeight * chatcontainer.ActualHeight;
            var basic_height = e.ViewportHeight / e.ExtentHeight * chatcontainer.ActualHeight;

            if (basic_height < 40) // min height
            {
                var extend_height = (40 - basic_height) / 2;
                basic_top -= extend_height;
                basic_height = 40;
            }
            if (basic_top + basic_height > chatcontainer.ActualHeight - 4) // min top
            {
                basic_top = chatcontainer.ActualHeight - basic_height - 4;
            }
            if (e.ExtentHeight == 0 || e.ViewportHeight >= e.ExtentHeight) // initial state
            {
                basic_top = 0;
                basic_height = 0;
            }

            chatscrollbar.Margin = new Thickness(0, basic_top, 4, 0);
            chatscrollbar.Height = basic_height;
        }

        private StreamWriter message_record;
        private void handleMessageReceived(object sender, LiveChatMessage message)
        {
            Dispatcher.Invoke(() =>
            {
                state.AddMessage(message);
            });
            if (message_record != null)
            {
                message_record.WriteLine($"{message.TimeStamp},{message.MemberInfo},{message.Price},{message.UserName},\"{message.Content}\"");
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

            Resources["ChatItemWidth"] = Width - 18;
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
// 3. getcursorpos unexpectedly on per monitor dpi, it seems like (x/dpi, y/dpi) is enough
// 5. draggable virtual scroll bar
// 7. room id history
// 10. move summary/statistics/insights python script into solution