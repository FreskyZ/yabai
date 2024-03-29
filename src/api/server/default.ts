//-----------------------------------------------------------------------------------------------
// This code was generated by a tool.
// Changes to this file may cause incorrect behavior and will be lost if the code is regenerated.
//-----------------------------------------------------------------------------------------------

import { FineError } from '../../adk/error';
import { ForwardContext, Context } from '../../adk/api-server';
import { validateNumber } from '../../adk/api-server';
import type { Archive, LiveInfo, PlayInfo, ChatConfiguration } from '../types';

export interface DefaultImpl {
    getArchives: (year: number, month: number, ctx: Context) => Promise<Archive[]>,
    getLiveInfo: (id: number, ctx: Context) => Promise<LiveInfo>,
    getPlayInfo: (realid: number, ctx: Context) => Promise<PlayInfo[]>,
    getChatConf: (realId: number, ctx: Context) => Promise<ChatConfiguration>,
}

export async function dispatch(ctx: ForwardContext, impl: DefaultImpl): Promise<void> {
    let match: RegExpExecArray;
    const methodPath = `${ctx.method} ${ctx.path.slice(11)}`;

    match = /^GET \/archives\/(?<year>\d+)\/(?<month>\d+)$/.exec(methodPath); if (match) {
        ctx.body = await impl.getArchives(validateNumber('year', match.groups['year']), validateNumber('month', match.groups['month']), ctx.state);
        return;
    }
    match = /^GET \/liveinfo\/(?<id>\d+)$/.exec(methodPath); if (match) {
        ctx.body = await impl.getLiveInfo(validateNumber('id', match.groups['id']), ctx.state);
        return;
    }
    match = /^GET \/playinfo\/(?<realid>\d+)$/.exec(methodPath); if (match) {
        ctx.body = await impl.getPlayInfo(validateNumber('realid', match.groups['realid']), ctx.state);
        return;
    }
    match = /^GET \/chatconf\/(?<realId>\d+)$/.exec(methodPath); if (match) {
        ctx.body = await impl.getChatConf(validateNumber('realId', match.groups['realId']), ctx.state);
        return;
    }

    throw new FineError('not-found', 'invalid invocation');
}
