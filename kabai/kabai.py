#!python3

from collections import namedtuple
from time import sleep
import datetime, json, os, re, requests, signal, sys, threading

SINGLE_PUSH = 13046   # this is really single push because it is not array
HIGHLIGHTS = [67141, 14272337]  # highlight users
DATA_SOURCE = 'yabai' # or 'matsuri.icu' for matsuri.icu style website, actually only tested asdanmaku.com which exactly dies when I first publish this code to github
MOCK = False

# j = json.load(open('1654342284257.json'))
# print('\n'.join([f"[{datetime.fromtimestamp(c['time']/1000):%H:%M:%S}] {c['username']}: {c['text']}" for c in j['full_comments'] if c['user_id'] == 67141]))

def print_help(code):
    print('kabai: Command line version of YABAI, another danmu machine')
    print()
    print('USAGE:')
    print('    kabai fetch DATE')
    print('    kabai play DATE')
    print()
    print('ARGS:')
    print('    DATE      6 digits for YYMMDD, 8 digits for YYYYMMDD, 10 digits for YYYYMMDDhh')
    print('              or 14 digits for YYYYMMDDhhmmss, identify a specific stream by start time')
    print('              start with additional \'y\' for data source from yabai)')
    print()
    print('SUBCOMMANDS:')
    print('    fetch     fetch raw danmu record from https://asdanmaku.com, no arg for list')
    print('    play      display specified stream\'s danmu start from beginning, auto fetch')
    print()
    print('PAUSE COMMANDS:')
    print('    <Ctrl+C>     pause playing')
    print('    continue     continue playing')
    print('    leap TIME    time leap to hhmmss relative to stream start')
    print()
    exit(code)

# year month day will not be None, hour minute second may be None, all processed as local timezone
class Criteria(namedtuple('Criteria', 'year month day hour minute second')):
    def match(self, start_time):
        if start_time.year != self.year or start_time.month != self.month or start_time.day != self.day:
            return False
        if self.hour is not None and self.hour != start_time.hour:
            return False
        if self.minute is not None and self.minute != start_time.minute:
            return False
        if self.second is not None and self.second != start_time.second:
            return False
        return True
    def __str__(self):
        b = f'criteria {self.year}-{self.month}-{self.day}'
        if self.hour is not None:
            b += f' {self.hour}'
        if self.minute is not None:
            b += f':{self.minute}'
        if self.second is not None:
            b += f':{self.second}'
        return b

def process_criteria(raw):
    if not re.match(r'^\d+$', raw):
        print('kabai: invalid DATE, see help')
        exit(1)

    if len(raw) == 4:
        raw = f'{datetime.date.today().year}' + raw
    elif len(raw) == 6:
        raw = '20' + raw # was not expecting this script to be run in 22nd century

    year = int(raw[0:4])
    month = int(raw[4:6])
    day = int(raw[6:8])
    hour = int(raw[8:10]) if len(raw) >= 10 else None
    minute = int(raw[10:12]) if len(raw) == 14 else None
    second = int(raw[12:14]) if len(raw) == 14 else None
    # this does not validate datetime, it's ok because that will fond nothing
    return Criteria(year, month, day, hour, minute, second)

def download_json(url):
    if MOCK:
        if url.endswith('clips'):
            return json.load(open('clips.json'))
        elif url.endswith('comments'):
            return json.load(open('comments.json'))
        else:
            return None
    else:
        response = requests.get(url)
        try:
            return response.json()
        except Exception as e:
            print(e)
            print(url)
            print(response)
            exit(1)

INFO_FILE = 'data/streams.json'
fromtimestamp = datetime.datetime.fromtimestamp
class Info(namedtuple('Info', 'id title start end')):
    def __str__(self):
        duration = self.end.replace(microsecond=0) - self.start.replace(microsecond=0)
        return f'{self.start.strftime("%y-%m-%d")} "{self.title}" {self.start.strftime("%H:%M:%S")} - {self.end.strftime("%H:%M:%S")} ({duration})'

def load_info(force):
    if force or not os.path.exists(INFO_FILE):
        response = download_json(f'https://api.asdanmaku.com/channel/{SINGLE_PUSH}/clips')
        if response['status'] != 0:
            print(f'kabai: fetch info meet status {response["status"]}')
            exit(2)

        cache_result = [{
            'id': r['id'],
            'title': r['title'],
            'start_time': r['start_time'] / 1000,
            # end_time may be missing
            'end_time': (r['start_time'] / 1000) if r['end_time'] is None else (r['end_time'] / 1000),
        } for r in response['data']]
        with open(INFO_FILE, 'w') as f:
            f.write(json.dumps(cache_result))

        return [Info(r['id'], r['title'], fromtimestamp(r['start_time']), fromtimestamp(r['end_time'])) for r in cache_result]
    else:
        return [Info(r['id'], r['title'], fromtimestamp(r['start_time']), fromtimestamp(r['end_time'])) for r in json.load(open(INFO_FILE))]

def load_comments(id):
    if not os.path.exists(f'data/{id}.json'):
        response = download_json(f'https://api.asdanmaku.com/clip/{id}/comments')
        if response['status'] != 0:
            print(f'kabai: fetch comments meet status {response["status"]}')
            exit(2)
        with open(f'data/{id}.json', 'w') as f:
            f.write(json.dumps(response['data']))
        return response['data']
    else:
        return json.load(open(f'data/{id}.json'))

# criteria is None for display all
def fetch(criteria):
    all_info = load_info(False)
    if criteria is None:
        for i in all_info:
            print(i)
        exit(0)
    info = next((i for i in all_info if criteria.match(i.start)), None)
    if info is None:
        all_info = load_info(True)
        info = next((i for i in all_info if criteria.match(i.start)), None)
        if info is None:
            print(f'not found for {criteria}')
            exit(3)
    return info, load_comments(info.id)

def process_fetch(criteria):
    info, comments = fetch(criteria)
    print(f'fetch {info} {len(comments)} comments')

REPLACEMENT = [
    ('赞', '👍'),
    ('?', '❓'),
    ('？', '❓'),
    ('草', '🌿'),
    ('宝贝', '👶'),
    ('呃呃', '💀'),
]

class Comment(object):
    def __init__(self, raw):
        self.time = fromtimestamp(raw['time'] / 1000)
        self.user_id = raw['user_id']
        self.user_name = raw['username']
        self.text = raw['text']
        self.superchat = raw['superchat_price'] if 'superchat_price' in raw else None
    
    def is_special(self):
        return self.user_id in HIGHLIGHTS or self.superchat is not None

    def __str__(self):
        b = ''
        if self.user_id in HIGHLIGHTS:
            b += '❗❗❗'
        if self.superchat:
            b += f'💲{self.superchat} '
        text = '😆' if self.text == '乐' else self.text
        for origin, replace in REPLACEMENT:
            text = text.replace(origin, replace)
        b += f'{self.user_name}: {text}'
        return b

def format_delta(delta):
    hours = delta.seconds // 3600
    minutes = (delta.seconds - hours * 3600) // 60
    seconds = delta.seconds - hours * 3600 - minutes * 60
    return f'{hours:02}:{minutes:02}:{seconds:02}'

# need some state for every frame (each time timer is called) to process
#
# NOTE thread timer does not guarantee it is always exactly called after specfied time
# but as a danmu machine, display some danmu a little earlier and later is not important (actually because it is live stream all danmu is kind of late)
# but no large accumulated offset is not allowed, that is, need to constantly compare current real time to displayed time to prevent that
class Player(object):
    def __init__(self, info, comments, event):
        self.info = info
        self.comments = comments
        self.event = event
        self.index = 0 # displayed comment count, time based search will in [index:] because danmu count may be very high
        self.delta = datetime.datetime.now() - info.start
        self.clockgap = 60 # clock interval, in seconds, can customize
        self.bans = [] # banned uids

    def display(self):
        now = datetime.datetime.now()
        vtime = now - self.delta
        index = self.index
        for comment in self.comments[index:]:
            if comment.time <= vtime:
                if comment.user_id not in self.bans:
                    print(comment)
                self.index += 1
        relvtime = vtime - self.info.start # relative virtual time
        if relvtime.seconds % self.clockgap == 0: # report time per self.clockgap second, can use 1 to show this is running if danmu density is low
            print(f'<---- {format_delta(relvtime)} ({vtime.strftime("%H:%M:%S")}) ---->')
        return self.index < len(self.comments)

    def interrupt(self):
        pause_time = datetime.datetime.now()
        print('PAUSE')
        while True:
            command = input('> ')
            if len(command) == 0 or command == 'continue':
                if len(command) == 0:
                    print('continue')
                self.delta += datetime.datetime.now() - pause_time
                break
            elif command.startswith('leap '):
                if not re.match(r'^\d{4,6}$', command[5:]):
                    print('invalid leap target')
                hours = int(command[5:7])
                minutes = int(command[7:9])
                seconds = int(command[9:11]) if len(command) > 9 else 0
                self.delta = datetime.datetime.now() - (self.info.start + datetime.timedelta(hours=hours, minutes=minutes, seconds=seconds))
                # abort comments before this
                self.index = 0
                target_time = datetime.datetime.now() - self.delta
                for comment in self.comments:
                    if comment.time <= target_time:
                        self.index += 1
                break
            elif command == 'ff' or command.startswith('ff '):
                seconds = 30
                if command.startswith('ff '):
                    if not re.match(r'^\d+$', command[3:]):
                        print('invalid fast farward seconds')
                    seconds = int(command[3:])
                self.delta += (datetime.datetime.now() - pause_time) - datetime.timedelta(seconds=seconds)
                # this does not jump forward self.index
                break
            elif command.startswith('clock '):
                if not re.match(r'^\d+$', command[6:]):
                    print('invalid clock gap')
                self.clockgap = int(command[6:])
                # require continue to continue so continue # require continue command to continue display, so continue loop
            elif command.startswith('uid '):
                if not re.match(r'^\d+$', command[4:]):
                    print('invalid uid format')
                uid = int(command[4:])
                count = 0
                for comment in self.comments:
                    if comment.user_id == uid:
                        count += 1
                        print(f'{format_delta(comment.time - self.info.start)} ({comment.time.strftime("%H:%M:%S")}) {comment}')
                print(f'{count} comments found')
            elif command.startswith('uname '):
                usernames = []
                for comment in self.comments:
                    if command[6:] in comment.user_name and comment.user_name not in [n for n, _ in usernames]:
                        usernames.append((comment.user_name, comment.user_id))
                        if len(usernames) > 10:
                            break
                for username, userid in usernames:
                    print(f'{username} ({userid})')
            elif command == 'banlist':
                print(self.bans)
            elif command.startswith('ban '):
                if not re.match(r'^\d+$', command[4:]):
                    print('invalid uid format')
                uid = int(command[4:])
                self.bans.append(uid)
            elif command.startswith('unban '):
                if not re.match(r'^\d+$', command[6:]):
                    print('invalid uid format')
                uid = int(command[6:])
                if uid in self.bans:
                    self.bans.remove(uid)
            elif command == 'time':
                vtime = pause_time - self.delta
                relvtime = vtime - self.info.start
                print(f'<{format_delta(relvtime)} ({vtime.strftime("%H:%M:%S")})>')
            elif command == 'exit' or command == '88':
                print('bye')
                exit(0)
            elif command == 'help':
                print('continue / exit / time / leap hhmmss / ff second / clock second / uid 67141 / ban uid / unban uid / banlist')
            else:
                print('unknown command')

    def run(self):
        while True:
            try:
                if not self.display():
                    print('live stream ends!')
                    break
                sleep(1)
            except KeyboardInterrupt:
                self.interrupt()
        
def process_play(criteria):
    info, comments = fetch(criteria)
    print(f'play {info} {len(comments)} comments')

    event = threading.Event()
    comments = [Comment(c) for c in comments if 'gift_price' not in c] # filter out gift
    player = Player(info, comments, event)
    player.run()
    # signal.signal(signal.SIGINT, player.interrupt)

if __name__ == '__main__':
    if len(sys.argv) == 1:
        print_help(0)

    if sys.argv[1] == 'help':
        print_help(0)
    elif sys.argv[1] == 'fetch':
        if len(sys.argv) not in (2, 3):
            print('kabai: invalid args, see help')
            exit(1)
        process_fetch(process_criteria(sys.argv[2]) if len(sys.argv) == 3 else None)
    elif sys.argv[1] == 'play':
        if len(sys.argv) != 3:
            print('kabai: missing DATE, see help')
            exit(1)
        process_play(process_criteria(sys.argv[2]))
    else:
        print('kabai: unknown subcommand')
        print_help(1)
