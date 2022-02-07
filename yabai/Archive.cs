using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;

namespace yabai
{
    internal class Archive
    {
        private static readonly string FolderName = 
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "yabai", "archive");

        private string filename;
        private StreamWriter writer;
        public void HandleMessageReceived(object sender, LiveChatMessage message)
        {
            if (writer != null)
            {
                var builder = new StringBuilder()
                    .Append(message.TimeStamp).Append(',')
                    .Append(message.MemberInfo).Append(',')
                    .Append(message.Price).Append(',')
                    .Append(message.UserName).Append(',');

                if (message.Content.Contains(','))
                {
                    builder.Append('"');
                }
                builder.Append(message.Content);
                if (message.Content.Contains(','))
                {
                    builder.Append('"');
                }

                writer.WriteLine(builder.ToString());
            }
        }

        // refresh info at base timer
        public void Refresh(LiveInfo info)
        {
            var foldername = Path.Combine(FolderName, info.RoomId.ToString());
            if (!Directory.Exists(foldername))
            {
                Directory.CreateDirectory(foldername);
            }

            // flush when change from living to not living
            if (!info.Living && writer != null)
            {
                writer.Flush();
                writer.Dispose();
                writer = null;
            }

            // flush and create new when change room
            var newFileName = Path.Combine(foldername, $"{info.StartTime:yyMMdd-HHmmss}.csv");
            if (filename != newFileName)
            {
                if (writer != null)
                {
                    writer.Flush();
                    writer.Dispose();
                    writer = null;
                }
                filename = newFileName;

                try
                {
                    writer = File.AppendText(filename);
                }
                catch
                {
                    MessageBox.Show("Cannot open archive file, not saving.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }
        // try fetch previous archived messages and refresh info at reload all
        public DisplayChatMessage[] Reload(LiveInfo info)
        {
            var filename = Path.Combine(FolderName, info.RoomId.ToString(), $"{info.StartTime:yyMMdd-HHmmss}.csv");
            if (!File.Exists(filename))
            {
                return Array.Empty<DisplayChatMessage>();
            }

            return File.ReadAllLines(filename).Select(line =>
            {
                var message = line.Split(',');
                return new DisplayChatMessage
                {
                    Count = 1,
                    TimeStamp = long.Parse(message[0]),
                    Price = string.IsNullOrEmpty(message[2]) ? null : message[2],
                    UserName = message[3],
                    Content = message[4].Trim('"'),
                };
            }).ToArray();
        }

        public void Flush()
        {
            if (writer != null)
            {
                writer.Flush();
            }
        }
    }
}
