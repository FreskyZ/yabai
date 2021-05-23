using System;
using System.IO;

namespace SGMonitor
{
    public class Logger
    {
        private readonly StreamWriter writer;
        public Logger()
        {
            writer = File.AppendText("log.txt");
        }

        public Logger Log(string message)
        {
            writer.Write($"[{DateTime.UtcNow.ToLongDateString()} {DateTime.UtcNow.ToLongTimeString()}] {message}\n");
            return this;
        }

        public void Flush()
        {
            writer.Flush();
        }
    }
}
