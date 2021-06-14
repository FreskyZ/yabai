using System;
using System.IO;

namespace yabai
{
    public class Logger
    {
        private readonly StreamWriter writer;
        public Logger()
        {
            writer = new StreamWriter(File.OpenWrite("log.txt"));
        }

        public void Log(string message)
        {
            writer.Write($"[{DateTime.UtcNow.ToLongDateString()} {DateTime.UtcNow.ToLongTimeString()}] {message}\n");
        }

        public void Flush()
        {
            try
            {
                writer.Flush();
            }
            catch
            {
                // ignore
            }
        }
    }
}
