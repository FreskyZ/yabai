
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
    startTime: number,
}

export interface PlayInfo {
    protocol: string,
    format: string,
    codec: string,
    url: string,
}
