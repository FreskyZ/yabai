using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows.Media;

namespace SGMonitor
{
    public class MainWindowState : INotifyPropertyChanged
	{
		private ImageSource p_Icon = null;
		public ImageSource Icon { get => p_Icon; set { p_Icon = value; Notify(); } }

		private string p_LiveTitle = "-";
		public string LiveTitle { get => p_LiveTitle; set { p_LiveTitle = value; Notify(); Notify(nameof(WindowTitle)); } }
		public string WindowTitle { get => p_LiveTitle + " - yabai"; }

		private bool p_LiveState = false;
		public bool LiveState { set { p_LiveState = value; Notify(nameof(LiveStateDescription)); Notify(nameof(LiveChatIconWidth)); } }
		public string LiveStateDescription { get => p_LiveState ? "LIVE" : "NOT LIVE"; }
		public string LiveStateTooltip { get => !p_LiveState ? "NOT LIVE" : $"LIVE {DateTime.Now - LiveStartTime:hh\\:mm\\:ss}"; }
		public DateTime LiveStartTime { get; set; }

		private string p_ChatState = "NOT CHAT";
		public string ChatState { get => p_ChatState; set { p_ChatState = value; Notify(); Notify(nameof(ChatStateDescription)); Notify(nameof(LiveChatIconWidth)); } }
		public string ChatStateDescription { get => p_ChatState == "NOT CHAT" ? "CHAT SERVER NOT CONNECTED" : p_ChatState == "CHAT" ? "CHAT SERVER CONNECTED" : "CHAT SERVER CONNECT ERROR"; }

		public double LiveChatIconWidth { get => !p_LiveState || p_ChatState == "NOT CHAT" ? 110 : 84; }

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

		private int p_MessageCount = 0;
		public int MessageCount { get => p_MessageCount; set { p_MessageCount = value; Notify(nameof(ChatStatistics)); } }

		private Dictionary<string, int> p_MessageWordCount = new() { ["草"] = 0, ["哈"] = 0, ["？"] = 0, ["臭人"] = 0 };
		public void AddWordCount(string word, int count = 1) { if (p_MessageWordCount.ContainsKey(word)) { p_MessageWordCount[word] += count; Notify(nameof(ChatStatistics)); } }
		public string ChatStatistics { get => $"count {p_MessageCount}, {string.Join(", ", p_MessageWordCount.Select(kv => $"{kv.Key}: {kv.Value}"))}"; }

		public event PropertyChangedEventHandler PropertyChanged;
		public void Notify([CallerMemberName] string propertyName = "")
		{
			PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
		}
	}
}
