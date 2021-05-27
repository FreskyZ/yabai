using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace SGMonitor
{
	public class MainWindowState : INotifyPropertyChanged
	{
		private ImageSource p_Icon = null; 
		public ImageSource Icon { get => p_Icon; set { p_Icon = value; Notify(); } }

		private string p_LiveTitle = "-"; 
		public string LiveTitle { get => p_LiveTitle; set { p_LiveTitle = value; Notify(); } }

		private bool p_LiveState = false; 
		public bool LiveState { set { p_LiveState = value; Notify(nameof(LiveStateDescription)); } } 
		public string LiveStateDescription { get => p_LiveState ? "LIVE" : "NOT LIVE"; }
		public DateTime LiveStartTime { get; set; }

		private string p_ChatState = "NOT CHAT";
		public string ChatState { get => p_ChatState; set { p_ChatState = value; Notify(); Notify(nameof(ChatStateDescription)); } }
		public string ChatStateDescription { get => p_ChatState == "NOT CHAT" ? "CHAT SERVER NOT CONNECTED" : p_ChatState == "CHAT" ? "CHAT SERVER CONNECTED" : "CHAT SERVER CONNECT ERROR"; }

		private bool p_OptionsVisible = false;
		public bool OptionsVisible { get => p_OptionsVisible; set { p_OptionsVisible = value; Notify(); } }

		private string p_RoomId = "92613";
		public string RoomId { get => p_RoomId; set { p_RoomId = value; Notify(); } }

		private string[] p_URLs = Array.Empty<string>();
		public string[] URLs { get => p_URLs; set { p_URLs = value; Notify(nameof(URLButtonEnabled)); Notify(nameof(URLNames)); } }
		public bool URLButtonEnabled { get => p_URLs.Length > 0; }
		public string[] URLNames { get => p_URLs.Select((_, index) => $"Line {index + 1}").ToArray(); }

		private string p_URLOpener = @"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe";
		public string URLOpener { get => p_URLOpener; set { p_URLOpener = value; Notify(); } }

		private int p_DisplayCount = 20;
		public int DisplayCount { get => p_DisplayCount; set { p_DisplayCount = value; Notify(); } }

		private double p_DisplayFontSize = 16;
		public double DisplayFontSize { get => p_DisplayFontSize; }
		public string ConfigFontSize { get => p_DisplayFontSize.ToString(); set { if (double.TryParse(value, out var v)) { p_DisplayFontSize = v; Notify(); Notify(nameof(DisplayFontSize)); } } }

		public event PropertyChangedEventHandler PropertyChanged;
		private void Notify([CallerMemberName] string propertyName = "")
		{
			PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
		}
	}

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
			chat.Chat += handleChat;
			chat.StateChanged += (s, e) => state.ChatState = e;

			var timer = new DispatcherTimer { Interval = new TimeSpan(0, 0, 1) };
            timer.Tick += Timer_Tick;
			timer.Start();

			// small event handlers
			stackpanelTitle.MouseDown += (s, e) => DragMove();
			textboxRoomId.PreviewTextInput += (s, e) => e.Handled = !s_number.IsMatch(e.Text);
			buttonOptions.Click += (s, e) => state.OptionsVisible = !state.OptionsVisible;
			buttonCopyLine.Click += (s, e) => Clipboard.SetData(DataFormats.Text, state.URLs[comboboxLines.SelectedIndex]);
			buttonOpenLine.Click += (s, e) => System.Diagnostics.Process.Start(state.URLOpener, $"\"{state.URLs[comboboxLines.SelectedIndex]}\"");

			// close
			buttonClose.Click += async (s, e) => { logger.Flush(); await chat.Stop(); Close(); };
			Application.Current.Exit += async (s, e) => { logger.Flush(); await chat.Stop(); };
		}

        private void Timer_Tick(object sender, EventArgs e)
		{
			if (state.LiveStartTime != DateTime.UnixEpoch)
			{
				rectangleLiveStateTooltipProvider.ToolTip = (DateTime.UtcNow - state.LiveStartTime).ToString(@"hh\:mm\:ss");
			}
		}

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
		private async void handleRefresh(object sender, RoutedEventArgs e)
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
				Title = $"{state.LiveTitle} - danmuji";
				state.LiveState = info.Living;

				state.URLs = info.StreamURLs;
				comboboxLines.SelectedIndex = 0;
				if (info.StreamURLs.Length > 0)
				{
					Clipboard.SetData(DataFormats.Text, info.StreamURLs[0]);
				}

				await chat.Start(room_id);
				state.ChatState = "CHAT";
			}
            catch
            {
                MessageBox.Show("not very success");
            }
		}

		private TextBlock[] textblockchats;
		private Style textblockchatStyle;
		private Dictionary<UserType, SolidColorBrush> textblockchatBackgroundColors;
		private int textblockchatLastIndex;
		private void InitializeChatPanel()
        {
			textblockchatStyle = Resources["ChatMessage"] as Style;
			textblockchatBackgroundColors = new Dictionary<UserType, SolidColorBrush>
			{
				[UserType.Normal] = Resources["ChatMessageNormalBackground"] as SolidColorBrush,
				[UserType.Member] = Resources["ChatMessageMemberBackground"] as SolidColorBrush,
				[UserType.Previledge] = Resources["ChatMessagePreviledgeBackground"] as SolidColorBrush,
			};

			textblockchats = Enumerable.Range(0, 20).Select(_ =>
			{
				var textblock = new TextBlock
				{
					Style = textblockchatStyle,
					Visibility = Visibility.Hidden,
				};
				textblock.MouseDown += (s, e) => DragMove();
				stackpanelChat.Children.Add(textblock);
				return textblock;
			}).ToArray();
			textblockchatLastIndex = 0;
        }

		private readonly LiveChatClient chat;
		private void handleChat(object sender, LiveChat message)
		{
			stackpanelChat.Children.Remove(textblockchats[textblockchatLastIndex]);

			textblockchats[textblockchatLastIndex].Text = message.Price is int price
				? $"{message.Time:hh\\:mm\\:ss} [!!\uFFE5{price}!!] [{message.MedalInfo}] {message.UserName}: {message.Content}"
				: $"{message.Time:hh\\:mm\\:ss} [{message.MedalInfo}] {message.UserName}: {message.Content}";
			textblockchats[textblockchatLastIndex].Background = textblockchatBackgroundColors[message.UserType];
			textblockchats[textblockchatLastIndex].Visibility = Visibility.Visible;

			stackpanelChat.Children.Add(textblockchats[textblockchatLastIndex]);
			textblockchatLastIndex = textblockchatLastIndex == 19 ? 0 : textblockchatLastIndex + 1;
        }

		#region Border
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
	}
}
