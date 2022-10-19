// @ts-ignore
import React from 'react';
// @ts-ignore
import { useState } from 'react';
import { $default as api } from '../api/client';

(window as any)['xxapi_liveinfo'] = async (roomId: number) => console.log(await api.getLiveInfo(roomId));
(window as any)['xxapi_playinfo'] = async (realId: number) => console.log(await api.getPlayInfo(realId));
(window as any)['getArchives'] = () => api.getArchives(2022, 10);
