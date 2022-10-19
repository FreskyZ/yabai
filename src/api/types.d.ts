
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
    protocol: string,
    format: string,
    codec: string,
    ttl: number,
    url: string,
}
