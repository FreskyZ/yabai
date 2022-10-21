
export interface Archive {
    startTime: number,
    endTime: number,
    titles: string[],
    danmuCount: number,
}

export interface LiveInfo {
    realId: number,
    userName: string,
    title: string,
    live: 'no' | 'live' | 'loop',
    startTime: number,
    coverImage: string, // url
    parentAreanName: string,
    areaName: string,
    avatarImage: string, // url
}

export interface PlayInfo {
    url: string,
    ttl: number,
    protocol: 'http_stream' | 'http_hls',
    format: 'flv' | 'ts' | 'fmp4',
    codec: 'avc' | 'hevc',
}

export interface ChatConfiguration {
    url: string,
    token: string,
}
