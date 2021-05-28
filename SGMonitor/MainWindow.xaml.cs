using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace SGMonitor
{
    public partial class MainWindow : Window
	{
		private static readonly Regex s_number = new(@"^\d+$");

		private readonly MainWindowState state;
		private readonly Logger logger;
        public MainWindow()
        {
            InitializeComponent();
			InitializeChatPanel();
			state = DataContext as MainWindowState;

			logger = new Logger();
			chat = new LiveChatClient(logger);
			chat.MessageReceived += handleChatMessageReceived;
			chat.StateChanged += (s, e) => state.ChatState = e;

			// small event handlers
			textboxRoomId.PreviewTextInput += (s, e) => e.Handled = !s_number.IsMatch(e.Text);
			buttonOptions.Click += (s, e) => state.OptionsVisible = !state.OptionsVisible;
			buttonCopyLine.Click += (s, e) => Clipboard.SetData(DataFormats.Text, state.URLs[comboboxLines.SelectedIndex]);
			buttonOpenLine.Click += (s, e) => System.Diagnostics.Process.Start(state.URLOpener, $"\"{state.URLs[comboboxLines.SelectedIndex]}\"");
			rectangleLiveStateTooltipProvider.ToolTipOpening += (s, e) => rectangleLiveStateTooltipProvider.ToolTip = state.LiveStateTooltip;

			// close
			buttonClose.Click += async (s, e) => { logger.Flush(); await chat.Stop(); Close(); };
			Application.Current.Exit += async (s, e) => { logger.Flush(); await chat.Stop(); };
		}

		private async Task refresh()
		{
			try
			{
				await chat.Stop();
				var room_id = int.Parse(state.RoomId);
				var info = await LiveInfo.Load(room_id, logger);

				if (info.LiverAvatar != null)
				{
					var image = ConvertToImage(info.LiverAvatar);
					Icon = image;
					state.Icon = image;
				}
				state.LiveState = true;
				state.LiveStartTime = info.StartTime;
				state.LiveTitle = $"{info.LiverName} - {info.LiveTitle}";
				state.LiveState = info.Living;

				state.URLs = info.StreamURLs;
				comboboxLines.SelectedIndex = 0;

				// await chat.Start(room_id);
				// chat.StartDemo();
			}
			catch
			{
				MessageBox.Show("not very success");
			}
		}

		private async void handleRefresh(object sender, RoutedEventArgs e)
        {
			await refresh();
		}
		private async void handleRoomIdKeydown(object sender, KeyEventArgs e)
		{
			if (e.Key == Key.Enter)
            {
				await refresh();
            }
		}

		private LiveChatItem[] chatitems;
		private int chatitemLastIndex;
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

		private readonly LiveChatClient chat;
		private void handleChatMessageReceived(object sender, LiveChatMessage message)
		{
			stackpanelChat.Children.Remove(chatitems[chatitemLastIndex]);

			chatitems[chatitemLastIndex].DataContext = message;
			chatitems[chatitemLastIndex].Visibility = Visibility.Visible;

			stackpanelChat.Children.Add(chatitems[chatitemLastIndex]);
			chatitemLastIndex = chatitemLastIndex == 19 ? 0 : chatitemLastIndex + 1;

			state.MessageCount += 1;
			if (message.Content.Contains("草")) { state.AddWordCount("草", message.Content.Count(c => c == '草')); }
			if (message.Content.Contains("哈")) { state.AddWordCount("哈", message.Content.Count(c => c == '哈')); }
			if (message.Content.Contains("？") || message.Content.Contains("?")) { state.AddWordCount("？", message.Content.Count(c => c == '？' || c == '?')); }
			if (message.Content.Contains("臭人")) { state.AddWordCount("臭人", 1); }
		}

		#region Border
		private void handleDragMove(object sender, MouseEventArgs e)
        {
			DragMove();
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
		#endregion

		private static BitmapImage ConvertToImage(byte[] bytes)
		{
			var image = new BitmapImage();
			using var stream = new MemoryStream(bytes);
			stream.Position = 0;
			image.BeginInit();
			image.CreateOptions = BitmapCreateOptions.PreservePixelFormat;
			image.CacheOption = BitmapCacheOption.OnLoad;
			image.UriSource = null;
			image.StreamSource = stream;
			image.EndInit();
			image.Freeze();
			return image;
		}
	}
}
