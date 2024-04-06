// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { bool, cstring, InnerType, Struct as S, u32, UnsizedType } from '@denosaurs/byte-type';
import { PhantomData, VariableArray } from './byte_types.ts';

export enum Header {
  NONE = 0,
  PING = 1,
  CONNECT = 2,
  DISCONNECT = 3,
  STOP_SERVER = 4,
  MAP_CHANGE = 5,
  HEART_BEAT = 6,
  MESSAGE = 7,
  COUNTDOWN = 8,
  UPDATE = 9,
  SPEEDRUN_FINISH = 10,
  MODEL_CHANGE = 11,
  COLOR_CHANGE = 12,
}

export class IVector {
  constructor(public x: number, public y: number, public z: number) {}
}

export class IDataGhost {
  constructor(
    public position: IVector,
    public view_angle: IVector,
    public view_offset: number,
    public grounded: boolean,
  ) {}
}

export class IColor {
  constructor(public r: number, public g: number, public b: number) {}
}

export class IClient {
  constructor(
    public id: number,
    public ip: number,
    public port: number,
    public name: string,
    public data: IDataGhost,
    public modelName: string,
    public currentMap: string,
    public tcpSocket: unknown,
    public tcpOnly: boolean,
    public color: IColor,
    public heartbeatToken: number,
    public returnedHeartbeat: boolean,
    public missedLastHeartbeat: boolean,
    public spectator: boolean,
  ) {}
}

export const Vector = {
  x: u32,
  y: u32,
  z: u32,
};

export const Color = {
  r: u32,
  g: u32,
  b: u32,
};

export const DataGhost = {
  position: new S(Vector),
  view_angle: new S(Vector),
  view_offset: u32,
  grounded: bool,
};

export const ConnectionPacket = {
  header: u32,
  port: u32,
  name: cstring,
  data: new S(DataGhost),
  model_name: cstring,
  current_map: cstring,
  tcp_only: bool,
  color: new S(Color),
  spectator: bool,
};

export const GhostEntity = {
  id: u32,
  name: cstring,
  data: new S(DataGhost),
  model_name: cstring,
  current_map: cstring,
  color: new S(Color),
  spectator: bool,
};

export const ConfirmConnectionPacket = {
  nb_ghosts: new PhantomData(Number),
  ghosts: new VariableArray(new S(GhostEntity)),
};

export const Struct = <
  T extends Record<string, UnsizedType<unknown>>,
  V extends { [K in keyof T]: InnerType<T[K]> } = {
    [K in keyof T]: InnerType<T[K]>;
  },
>(layout: T, size = 1024) => {
  return {
    pack: (value: V) => {
      const buffer = new ArrayBuffer(size);
      new S(layout).write(value, new DataView(buffer));
      return buffer;
    },
    unpack: (data: Uint8Array) => {
      return new S(layout).read(new DataView(data.buffer));
    },
  };
};
