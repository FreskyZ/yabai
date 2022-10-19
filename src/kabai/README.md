# KABAI

kabai is a command line tool used for playing real time danmu when viewing live stream archives to provide similar experience like real "live".

It is motived by the fact that bilibili does not have very usable official archive feature and not all live stream channels have that feature enabled or stable unofficial archive mechanism provided with usable real time danmu support.

It is currently very prototype (not well documented, not easy to config and feature unpolished) but it satisfies my requirement so may be no plan to make it better.

> 'KABAI' comes from '**C**ommand line version of y**ABAI**', or 'CABAI', while it is a hirakana meme, use more proper romaji representation 'KABAI'.
## Usage

NOTE: create `data` folder where this `kabai.py` is located, auto create directory TBD.

NOTE2: `data/streams.json` file is for single user id, if you single push another user, delete or archive it elsewhere.

configs are available as directly changing source code constant declaration

```py
SINGLE_PUSH = 13046  # live stream channel owner user id (not room id)
HIGHLIGHTS = [67141, 14272337]  # highlight danmu if included in this user id list
```

command line interface
```sh
# try find archive info and download danmu for the archive identified by date June 5, 2022
# the input date and time will be used to match live stream start time, local machine timezone
# available archive identifier include (strptime format):
# %m%d, %y%m%d, %Y%m%d, %Y%m%d%H, %Y%m%d%H%M%S # was not expecting 2 live streams start at same second
> kabai.py fetch 220605
# display current known archive info (danmu may not available, although called fetch but actually no network operations)
> kabai.py fetch
# play danmu for the archive identified by input date and time
> kabai.py play 0605
```

pause menu, you can always press Ctrl/Cmd + C when playing, and there are some commands available

```sh
# continue playing
> # (empty)
# continue playing
> continue
# time leap relative to archive start (should be easy to align with archive video playing)
# leap target may be `(?<hours>\d{2})(?<minutes>\d{2})` or `(?<hours>\d{2})(?<minutes>\d{2})(?<seconds>\d{2})`
> leap 0604
# fast forward several seconds, if fast farward interval not provided, it is default to 30
# all danmu between the 2 time points will still be played (should be easy to find specific danmu, etc.)
> ff 60
# since time is not displayed with each danmu message,
# a clock (video play time + real time at live stream) is displayed for easier sync with video playing, 
# use this to configure clock display interval, it is default to 60 seconds, configured in seconds
> clock 600
# display all danmu messages of provided uid
> uid 67141
# display all matching user names and their uid
> uname 薄凉之人无念安
# ban uid, hide danmu message of this user id
> ban 2
# unban uid
> unban 2
# display banned user id list
> banlist
# display current video play time + real time at live stream, same as clock's display
> time
# stop playing
> exit
```

## Acknowledgements

The archived danmu files comes from https://asdanmaku.com, thanks for
- website maintainer https://space.bilibili.com/5273959,
- original website technique provider https://matsuri.icu and maintainer https://space.bilibili.com/186629,
- A-SOUL_Official https://space.bilibili.com/703007996
