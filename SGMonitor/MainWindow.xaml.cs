using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace SGMonitor
{
    public partial class MainWindow : Window
    {
        private readonly Logger logger;
        private readonly LiveInfo info;
        public MainWindow()
        {
            InitializeComponent();

			logger = new Logger();
			info = new LiveInfo(logger);

			var timer = new DispatcherTimer { Interval = new TimeSpan(0, 0, 1) };
            timer.Tick += Timer_Tick;
			timer.Start();

			Application.Current.Exit += Application_Exit;
        }

        private void Application_Exit(object sender, ExitEventArgs e)
		{
			try { logger.Flush(); } catch { /* ignore */ }
		}
		
		private void close_Click(object sender, RoutedEventArgs e)
        {
			Close();
        }
		private void minimize_Click(object sender, RoutedEventArgs e)
        {
			WindowState = WindowState.Minimized;
        }

		private void setting_Click(object sender, RoutedEventArgs e)
        {
			// TODO
        }

		private void Timer_Tick(object sender, EventArgs e)
		{
			if (info.StartTime != DateTime.UnixEpoch)
            {
				textblockLiveTime.Text = (DateTime.UtcNow - info.StartTime).ToString(@"hh\:mm\:ss");
            }
		}

		private async void reload_Click(object sender, RoutedEventArgs e)
        {
            try
            {
				info.RoomId = 92613;

                await info.Refresh();

				textblockLiveTitle.Text = $"{info.LiverName} - {info.LiveTitle}";
				textblockLiveTitle.ToolTip = textblockLiveTitle.Text;
				pathLivingStateIcon.Fill = new SolidColorBrush(info.Living ? Colors.Green : Colors.Orange);
				textblockLivingState.Text = info.Living ? "LIVE" : "NOT LIVE";
				rectLivingState.ToolTip = info.Living ? "LIVE" : "NOT LIVE";

				comboboxLines.Items.Clear();
				for (var i = 0; i < info.StreamURLs.Length; ++i)
                {
					var item = new ComboBoxItem { Content = $"Line {i + 1}", Tag = i, ToolTip = "Click to Copy URL" };
                    item.Selected += line_Selected;
					comboboxLines.Items.Add(item);
                }
				comboboxLines.SelectedIndex = 0;

				if (info.LiverAvatar != null)
				{
					var image = new BitmapImage();
					using var stream = new MemoryStream(info.LiverAvatar);
					stream.Position = 0;
					image.BeginInit();
					image.CreateOptions = BitmapCreateOptions.PreservePixelFormat;
					image.CacheOption = BitmapCacheOption.OnLoad;
					image.UriSource = null;
					image.StreamSource = stream;
					image.EndInit();
					image.Freeze();

					Icon = image;
					imageAvatar.Source = image;
				}
			}
            catch
            {
                MessageBox.Show("not very success");
            }
        }

        private void line_Selected(object sender, RoutedEventArgs e)
        {
			var item = sender as ComboBoxItem;
			var index = (int)item.Tag;
			Clipboard.SetData(DataFormats.Text, info.StreamURLs[index]);
        }

		private void title_MouseDown(object sender, MouseButtonEventArgs e)
        {
			DragMove();
        }

        #region Border
        private bool m_IsMouseDownSizer;
		private double m_SizerPrevX;
		private double m_SizerPrevY;
		private double m_PrevLeft, m_PrevTop;
		private double m_PrevWidth, m_PrevHeight;
		private void sizer_MouseDown(object sender, MouseButtonEventArgs e)
		{
			var rect = sender as Rectangle;

			m_IsMouseDownSizer = true;
			rect.CaptureMouse();
			m_PrevTop = Top;
			m_PrevLeft = Left;
			m_PrevWidth = Width;
			m_PrevHeight = Height;

			var pt = Native.GetCursorPosition();

			m_SizerPrevX = pt.X;
			m_SizerPrevY = pt.Y;
		}

        private void sizer_MouseUp(object sender, MouseButtonEventArgs e)
		{
			var rect = sender as Rectangle;

			m_IsMouseDownSizer = false;
			rect.ReleaseMouseCapture();
		}
		private void sizer_MouseMove(object sender, MouseEventArgs e)
		{
			if (m_IsMouseDownSizer)
			{
				var pt = Native.GetCursorPosition();
				double offx = pt.X - m_SizerPrevX;
				double offy = pt.Y - m_SizerPrevY;

				if (sender == rectLeftBorderSizer || sender == rectLeftTopBorderSizer || sender == rectLeftBottomBorderSizer)
				{
					// for left
					offx = (m_PrevWidth - offx) >= MinWidth 
						? ((m_PrevWidth - offx) > MaxWidth ? (m_PrevWidth - MaxWidth) : offx)
						: (m_PrevWidth - MinWidth);
					Width = m_PrevWidth - offx;
					Left = m_PrevLeft + offx;
				}
				if (sender == rectRightBorderSizer || sender == rectRightTopBorderSizer || sender == rectRightBottomBorderSizer)
				{
					// for right
					offx = (m_PrevWidth + offx) >= MinWidth 
						? ((m_PrevWidth + offx) > MaxWidth ? (MaxWidth - m_PrevWidth) : offx)
						: (MinWidth - m_PrevWidth);
					Width = m_PrevWidth + offx;
				}
				if (sender == rectTopBorderSizer || sender == rectLeftTopBorderSizer || sender == rectRightTopBorderSizer)
				{
					// for top
					offy = (m_PrevHeight - offy) >= MinHeight
						? ((m_PrevHeight - offy) > MaxHeight ? (m_PrevHeight - MaxHeight) : offy)
						: (m_PrevHeight - MinHeight);
					Top = m_PrevTop + offy;
					Height = m_PrevHeight - offy;
				}
				if (sender == rectBottomBorderSizer || sender == rectLeftBottomBorderSizer || sender == rectRightBottomBorderSizer)
				{
					// for down
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
