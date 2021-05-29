using System.Runtime.InteropServices;

namespace yabai
{
    internal class Native
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct Point
        {
            public int X;
            public int Y;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern unsafe bool GetCursorPos(Point* pt);

        public static System.Windows.Point GetCursorPosition()
        {
            Point point;
            unsafe
            {
                GetCursorPos(&point);
            }
            return new System.Windows.Point(point.X, point.Y);
        }
    }
}
