using Microsoft.Win32;
using System;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace yabai
{
    public partial class MainWindow : Window
    {
        private static readonly Regex s_number = new(@"^\d+$");

        private readonly Logger logger;
        private readonly Archive archive;
        private readonly Setting setting;
        private readonly MainWindowViewModel state;

        private readonly DispatcherTimer base_timer; // 1 min timer for log flush, record flush, live info refresh and possible stream url refresh
        private readonly LiveChatClient chat_client;
        public MainWindow()
        {
            InitializeComponent();

            setting = Setting.Load();
            Left = setting.WindowLeft;
            Top = setting.WindowTop;
            Width = Math.Max(MinWidth, setting.WindowWidth);
            Height = Math.Max(MinHeight, setting.WindowHeight);
            Resources["ChatItemWidth"] = Width - 18;

            state = DataContext as MainWindowViewModel;
            state.SetSetting(setting);
            state.ChatContainerView = CollectionViewSource.GetDefaultView(chatcontainer.ItemsSource) as CollectionView;
            state.RoomIdSelected += (s, e) => handleRefreshAll(s, e);

            logger = new Logger();
            archive = new Archive();
            chat_client = new LiveChatClient(logger);
            chat_client.StateChanged += (s, e) => state.SetChatState(e);
            chat_client.MessageReceived += archive.HandleMessageReceived;
            chat_client.MessageReceived += (s, m) => Dispatcher.Invoke(() => state.AddMessage(m));

            // small event handlers
            buttonOptions.MouseEnter += (s, e) => state.OptionsVisible = true;
            headercontainer.MouseLeave += (s, e) => state.OptionsVisible = false;
            comboboxRoomIds.KeyDown += (s, e) => { if (e.Key == Key.Enter) { handleRefreshAll(s, e); } };
            buttonCopyLine.Click += (s, e) => { Clipboard.SetData(DataFormats.Text, state.StreamURLs[comboboxLines.SelectedIndex]); state.LastUsedStreamURL = state.StreamURLs[comboboxLines.SelectedIndex]; };
            buttonOpenLine.Click += (s, e) => { System.Diagnostics.Process.Start(state.MediaPlayer, $"\"{state.StreamURLs[comboboxLines.SelectedIndex]}\""); state.LastUsedStreamURL = state.StreamURLs[comboboxLines.SelectedIndex]; };
            rectangleLiveStateTooltipProvider.ToolTipOpening += (s, e) => rectangleLiveStateTooltipProvider.ToolTip = state.LiveStateTooltip;

            // close
            buttonClose.Click += async (s, e) => { Cursor = Cursors.Wait; await chat_client.StopAsync(); Close(); };
            Application.Current.Exit += async (s, e) => { logger.Flush(); archive.Flush(); setting.Save(this); await chat_client.StopAsync(); };

            // fetch live info auto
            base_timer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(1) };
            base_timer.Tick += handleBaseTimer;
            base_timer.Start();
        }

        private async void handleBaseTimer(object sender, EventArgs e)
        {
            logger.Flush();
            archive.Flush();

            if (state.RoomId != 0)
            {
                var info = await LiveInfo.GetAsync(state.RoomId, logger);
                state.SetLiveInfo(info);
                state.UpdateRoomHistory(info.RoomId, $"{info.LiveTitle} - {info.LiverName}");
                archive.Refresh(info);

                if (!info.Living)
                {
                    state.LastUsedStreamURL = null;
                    state.SetStreamURLs((new string[0], DateTime.UnixEpoch));
                }
                if (info.Living && state.StreamURLExpire != DateTime.UnixEpoch && state.StreamURLExpire - DateTime.Now < TimeSpan.FromMinutes(10))
                {
                    state.SetStreamURLs(await LiveInfo.GetStreamURLAsync(info.RealId, logger));
                }
            }

            setting.Save(this);
        }
        private async void handleRefreshAll(object sender, RoutedEventArgs e)
        {
            // chat_client.Replay(@"chat-92613-210619-200821.csv"); return;
            await chat_client.StopAsync();
            var info = await LiveInfo.GetAsync(state.RoomId, logger);
            state.SetLiveInfo(info);
            state.SetStreamURLs(await LiveInfo.GetStreamURLAsync(info.RealId, logger));
            comboboxLines.SelectedIndex = 0;
            state.UpdateRoomHistory(info.RoomId, $"{info.LiveTitle} - {info.LiverName}");
            state.LastUsedStreamURL = null;

            // archive.handle message received is hooked on live chat client, this direct insert will not duplicate messages
            state.SetMessages(archive.Reload(info));
            archive.Refresh(info);

            var (token, chat_urls) = await LiveInfo.GetChatInfoAsync(info.RealId, logger);
            await chat_client.StartAsync(info.RealId, chat_urls[0], token);
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
            // this event is trigger with a lot of x.xx000000001 and x.xx9999999999 and even x.xxE-15 values, round them
            var (extent_height, extent_change) = (Math.Round(e.ExtentHeight, 2), Math.Round(e.ExtentHeightChange, 2));
            var (viewport_height, viewport_change) = (Math.Round(e.ViewportHeight, 2), Math.Round(e.ViewportHeightChange, 2));
            var (vertical_offset, vertical_change) = (Math.Round(e.VerticalOffset, 2), Math.Round(e.VerticalChange, 2));

            //System.Diagnostics.Debug.WriteLine(
            //    $"extent {extent_height} change {extent_change} viewport {viewport_height} change {viewport_change} position {vertical_offset} offset {vertical_change}");

            // auto scroll
            if (extent_change > 0 && vertical_change == 0 && chatcontainer.Items.Count > 0 && state.AutoScroll)
            {
                chatcontainer.ScrollIntoView(chatcontainer.Items[chatcontainer.Items.Count - 1]);
            }

            // disable auto scroll when user scroll when auto scroll
            // NOTE the previous scroll into view will create an event that extent change = 0 and viewport change = 0 but vertical offset > 0 (scroll down)
            //      while initial user scroll must scroll up (vertical change < 0) so the condition is < 0 not != 0
            if (state.AutoScroll && extent_change == 0 && viewport_change == 0 && vertical_change < 0)
            {
                state.AutoScroll = false;
            }
            // enable auto scroll when user scroll when not auto scroll
            if (!state.AutoScroll && extent_height == viewport_height + vertical_offset)
            {
                state.AutoScroll = true;
            }

            // normally displays at [vertical offset / extent height, (vertical offset + viewport height) / extent height] * container height
            // min display height is 40px, if less, expand to 2 directions

            var basic_top = vertical_offset / extent_height * chatcontainer.ActualHeight;
            var basic_height = viewport_height / extent_height * chatcontainer.ActualHeight;

            if (basic_height < 30) // min height
            {
                var extend_height = (30 - basic_height) / 2;
                basic_top -= extend_height;
                basic_height = 30;
            }
            if (basic_top + basic_height > chatcontainer.ActualHeight - 4) // min top
            {
                basic_top = chatcontainer.ActualHeight - basic_height - 4;
            }
            if (extent_height == 0 || viewport_height >= extent_height) // initial state
            {
                basic_top = 0;
                basic_height = 0;
            }

            chatscrollbar.Margin = new Thickness(0, basic_top, 4, 0);
            chatscrollbar.Height = basic_height;
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
            if (e.LeftButton == MouseButtonState.Pressed && e.RightButton == MouseButtonState.Released)
            {
                DragMove();
            }
        }
    }
}

// TODO:
// 1. ui update, do not occupy one row when options not open
// 3. getcursorpos unexpectedly on per monitor dpi, it seems like (x/dpi, y/dpi) is enough
// 5. draggable virtual scroll bar
// 10. move summary/statistics/insights python script into solution