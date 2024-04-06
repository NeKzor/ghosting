// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { bool, cstring, Struct, u32, u8 } from '@denosaurs/byte-type';
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

  LAST = Header.COLOR_CHANGE,
}

export class IVector {
  constructor(public x: number, public y: number, public z: number) {}
}

export class IDataGhost {
  constructor(
    public position: IVector,
    public view_angle: IVector,
    public data: number,
  ) {}

  get viewOffset(): number {
    return this.data & 0b0111_1111;
  }
  set viewOffset(value: number) {
    this.data |= value & 0b0111_1111;
  }

  get grounded(): boolean {
    return (this.data & 0b1000_0000) !== 0;
  }
  set grounded(value: boolean) {
    this.data |= value ? 0b1000_0000 : 0b0000_0000;
  }
}

export class IColor {
  constructor(public r: number, public g: number, public b: number) {}
}

export class IClient {
  constructor(
    public id: number,
    public ip: string,
    public port: number,
    public name: string,
    public data: IDataGhost,
    public model_name: string,
    public current_map: string,
    public tcp_socket: Deno.Conn | undefined,
    public tcp_only: boolean,
    public color: IColor,
    public heartbeat_token: number,
    public returned_heartbeat: boolean,
    public missed_last_heartbeat: boolean,
    public spectator: boolean,
  ) {}
}

export class IGhostEntity {
  constructor(
    public id: number,
    public name: string,
    public data: IDataGhost,
    public model_name: string,
    public current_map: string,
    public color: IColor,
    public spectator: boolean,
  ) {
  }

  static from(client: IClient) {
    return new IGhostEntity(
      client.id,
      client.name,
      client.data,
      client.model_name,
      client.current_map,
      client.color,
      client.spectator,
    );
  }
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
  position: new Struct(Vector),
  view_angle: new Struct(Vector),
  data: u8,
};

export const ConnectionPacket = {
  header: u32,
  port: u32,
  name: cstring,
  data: new Struct(DataGhost),
  model_name: cstring,
  current_map: cstring,
  tcp_only: bool,
  color: new Struct(Color),
  spectator: bool,
};

export const GhostEntity = {
  id: u32,
  name: cstring,
  data: new Struct(DataGhost),
  model_name: cstring,
  current_map: cstring,
  color: new Struct(Color),
  spectator: bool,
};

export const ConfirmConnectionPacket = {
  id: u32,
  nb_ghosts: new PhantomData(Number),
  ghosts: new VariableArray(new Struct(GhostEntity)),
};

export const ConnectPacket = {
  header: u32,
  id: u32,
  name: cstring,
  data: new Struct(DataGhost),
  model_name: cstring,
  current_map: cstring,
  color: new Struct(Color),
  spectator: bool,
};

export const PingPacket = {
  header: u32,
  id: u32,
};

export const PingEchoPacket = {
  header: u32,
};

export const DisconnectPacket = {
  header: u32,
  id: u32,
};

export const MapChangePacket = {
  header: u32,
  id: u32,
  map_name: cstring,
  ticks: u32,
  ticks_total: u32,
};
