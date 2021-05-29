using System;
using System.IO;
using System.Timers;

namespace yabai
{
    public class Logger
    {
        private readonly StreamWriter writer;
        public Logger()
        {
            writer = new StreamWriter(File.OpenWrite("log.txt"));

            var timer = new Timer(60_000); // flush every 1 min
            timer.Elapsed += (s, e) => Flush();
            timer.Start();
        }

        public Logger Log(string message)
        {
            writer.Write($"[{DateTime.UtcNow.ToLongDateString()} {DateTime.UtcNow.ToLongTimeString()}] {message}\n");
            return this;
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
