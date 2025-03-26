# YABAI

bilibili live life quality improvement services

## Features

- live chat archive service, but not DD
- a cannot-be-simpler live viewing web page
- a command line live chat replay tool
- a cannot-be-simpler audio slice player ("button site")

## Status

Development will be halt for some time waiting for framework/tooling upgrade, but as long as
I'm watching bilibili live stream, I will continue work on this project.

## Motivation & History

There are (and were) many bilibili live chat archive services available publicly,
but bilibili really don't want these statistics to be available freely,
and they pay real effort to shut these services down, better ones and popular ones dies even more quickly,
despite their little effort to improve the website and application's quality and user experience.

The official bilibili live website has already become feature creep, like other Chinese live stream websites, 
user interface is filled by unnecessary features, and is of low performance because of these unnecessary features
and poor quality, network is filled by unnecesary data, despite most users really don't care about these
official advertisement or other live streamer advertisements, and cpu is working hard on decoding videos
and uncompressing live chat data because they choose video encodings and choose to compress live chat data
to save their server's network resource and don't care about user's cpu's power consumption and fan's noice.

The official windows store app and the unofficial windows store app seems stop maintaining and missing major features,
the [Bilibili-Evolved] browser plugin cannot solve some of the issues because it is a browser plugin,
the [DD_Monitor] seems good but I'm still not satisfied with some of its user exprience after fork and some changes,
(see the DD_Monitor fork history of this repository), then came this project.

The archive service is recreated or rewritten many times in this project,
initially it is an [bilibili-api] fork to test the feasibility for real time live chat viewing

### old YABAI

Then I rewrite it in c# and wpf, because I'm familiar with wpf in .net framework ages,
and I'd like to reexperience wpf development after these years of learning and developing.

The most interesting feature compare to other live chat viewer ("danmu machine") is that you 
can one-click open live stream by your own desktop video player, there was consideration of
including the video playing part in this application, but it was not implemented because playing
online video reliably in a desktop application without 3rd party library is complex and hard,
while open network stream is a basic functionality of a desktop video player,
one click open another video player is easy to develop, robust and of high performance.

### KABAI

kabai is a command line tool for replay live chat when viewing live stream archives
to provide similar experience like real "live", because bilibili official live stream
archive does not correctly include all the live chat data and the unofficial live stream
archives normally does not have live chat data, see [kabai](kabai) folder for detail.

The old YABAI actually implements basic archive feature and tries to implement replay feature,
but that was hard and was one of the motivations of kabai.

kabai does not actually use old YABAI's archive data but download from another archiving service,
that archiving service died exactly when kabai has completed development of initial version.

### new YABAI

The inconvenience of keep yabai open on my desktop and its unstablity motivates me to
develop a service-like version of this requirement, which is new YABAI

It worked really well, when this version of README is written,
it has flawlessly running on my cloud machine for near one complete year,
and also is also planned to expose api for future replaying requirements (not implemented yet)

This also makes me really tired of implementing bilibili live chat client logics one time after another,
while they constantly adding new types of junk which need to be filtered out 
and occassionally updating core data structure or processing logics to make the very basic functionality fail,
this will in theory become the last version of bilibili live chat client I implemented.

### Player

At some time I realized that the official website is playing live stream in the web browser without
help of native applications, so I in theory can implement the video player alone on my own website,
throwing away all other junk on the official web page, and it really can.

### Button

There is trandition in the vtuber community that estabilishing a "button site" for
playing interesting short audio tracks cut from live stream for entertaining,
they are called button sites because they mainly contains full page of buttons.

I envolved in developing one of the button sites, and the source code for these sites,
like other non-professional-fan-made projects, is old, references unnecssary dependencies,
strangely implemented and hard to continue developing, upon moving the audio tracks to formal
object storage service on modern cloud platform, I implemented this site for debugging purpose and for fun.

[Bilibili-Evolved]: https://github.com/the1812/Bilibili-Evolved
[DD_Monitor]: https://github.com/zhimingshenjun/DD_Monitor/issues
[bilibili-api]: https://github.com/Passkou/bilibili-api
[bililive_dm]: https://github.com/copyliu/bililive_dm

## Glossary?

- `YABAI`: Yet Another Bilibili dAnmu servIce
- `KABAI`: Kommand line version of yABAI
