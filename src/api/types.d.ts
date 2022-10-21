
export interface Archive {
    startTime: number,
    endTime: number,
    titles: string[],
    danmuCount: number,
}

export interface LiveInfo {
    realid: number,
    userName: string,
    title: string,
    live: 'no' | 'live' | 'loop',
    startTime: number,
    coverImage: string,
    parentAreanName: string,
    areaName: string,
}

export interface PlayInfo {
    protocol: 'http_stream' | 'http_hls',
    format: 'flv' | 'ts' | 'fmp4',
    codec: 'avc' | 'hevc',
    ttl: number,
    url: string,
}
