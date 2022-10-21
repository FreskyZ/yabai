import { $default as api } from '../api/client';
import Hls from 'hls.js';

const elements = {
    video: document.querySelector('video'),
    control: document.querySelector('div#control-panel') as HTMLDivElement,
};

const hash = window.location.hash.substring(1);
const roomId = isNaN(parseInt(hash)) ? 92613 : parseInt(hash);

// mypack currently only supports commonjs, so cannot top level await for now
(async () => {
    const liveinfo = await api.getLiveInfo(roomId);
    if (liveinfo.live == 'live') {
        document.title = `${liveinfo.title} - 单推播放器`;
        const playinfo = await api.getPlayInfo(liveinfo.realid);
        if (Hls.isSupported()) {
            const hls = new Hls();
            hls.attachMedia(elements.video);
            hls.on(Hls.Events.ERROR, (event, data) => console.log('hls error', event, data));
            // hls.on(Hls.Events.MANIFEST_PARSED, () => elements.video.play());
            hls.attachMedia(elements.video);
            hls.loadSource(playinfo.find(p => p.protocol == 'http_hls' && p.format == 'fmp4' && p.codec == 'avc').url);
        } else {
            elements.video.src = playinfo.find(p => p.protocol == 'http_stream' && p.format == 'flv' && p.codec == 'avc').url;
            elements.video.play();
        }
    }
})();
