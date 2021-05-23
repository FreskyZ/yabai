using System;
using System.Linq;

namespace SGMonitor
{
    internal enum LiveQuality
    {
        Fluence = 80,
        HighResolution = 150,
        SuperResolution = 250,
        Blueray = 400,
        Original = 10000,
    }

    internal static class LiveQualityExtension
    {
        private static readonly int[] valid_values = new[] { 80, 150, 250, 400, 10000 };
        public static LiveQuality ToLiveQuality(int value)
        {
            if (!valid_values.Contains(value))
            {
                throw new InvalidOperationException("invalid quality number");
            }
            return (LiveQuality)value;
        }
    }
}
