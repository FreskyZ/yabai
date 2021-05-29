using System.Diagnostics;
using System.Globalization;
using System.Windows;

namespace yabai
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            if (Debugger.IsAttached)
            {
                CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.GetCultureInfo("en-US");
            }
            base.OnStartup(e);
        }
    }
}
