# YABAI

.NET and WPF based bilibili live chat viewer and ~~live stream viewer~~.

The core feature of this live chat viewer ("danmu machine") that makes this one different from others is this provides you a **one click** button to open live stream by your own desktop video player. 

## Build

Install .NET and WPF workloads in Visual Studio Installer and open solution with Visual Studio.

## Q & A

### What's `yabai` stand for?

> **Y**et **A**nother **B**ilibili d**A**nmu mach**I**ne

### What't the motivation of this project?

I don't like bilibili live website because it is slow, filled by junk while missing core experience features like chat message filtering and merging. Windows store app and [Bilibili-Evolved] does not actually solve these issues. Then I found [DD_Monitor] which is rather a great replacement, but I'm still not satisfied with some of its user exprience after fork and some changes, then came this project.

I used to develop WPF at the age of .NET framework, after several years of absense and use of other UI libraries/frameworks like React and Vue, I'd like to come back to WPF and .NET 5 to try new features and gain new inspirations.

### Why is live stream viewer not included?

Because play online video reliably in a desktop application without 3rd party library is complex and hard to develop, while open network stream is basic functionality of a desktop video player, one click open another video player is easy to develop, robust and of high performance.

### Other related projects

I also learn from [bilibili-api] and [bililive_dm] during development process.

[Bilibili-Evolved]: https://github.com/the1812/Bilibili-Evolved
[DD_Monitor]: https://github.com/zhimingshenjun/DD_Monitor/issues
[bilibili-api]: https://github.com/Passkou/bilibili-api
[bililive_dm]: https://github.com/copyliu/bililive_dm
