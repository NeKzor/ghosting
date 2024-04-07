// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { bool, f32be, Struct, u16be, u32be, u8 } from '@denosaurs/byte-type';
import { PhantomData, sf_packet, std_string, VariableArray } from './byte_types.ts';

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

  get view_offset(): number {
    return this.data & 0b0111_1111;
  }
  set view_offset(value: number) {
    this.data |= value & 0b0111_1111;
  }

  get grounded(): boolean {
    return (this.data & 0b1000_0000) !== 0;
  }
  set grounded(value: boolean) {
    this.data |= value ? 0b1000_0000 : 0b0000_0000;
  }

  [Symbol.for('Deno.customInspect')]() {
    const { position, view_angle, view_offset, grounded } = this;
    const inspect = Deno.inspect({ position, view_angle, view_offset, grounded }, {
      colors: true,
      compact: false,
    });
    return `IDataGhost ${inspect.replaceAll('\n', '\n      ')}`;
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
    public tcp_socket: Deno.Conn,
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

export const Vector = new Struct({
  x: f32be,
  y: f32be,
  z: f32be,
});

export const Color = new Struct({
  r: u8,
  g: u8,
  b: u8,
});

export const DataGhost = new Struct({
  position: Vector,
  view_angle: Vector,
  data: u8,
});

export const DataGhostUpdate = new Struct({
  id: u32be,
  data: DataGhost,
});

export const GhostEntity = new Struct({
  id: u32be,
  name: std_string,
  data: DataGhost,
  model_name: std_string,
  current_map: std_string,
  color: Color,
  spectator: bool,
});

export const PACKET_BUFFER_SIZE = 1_024;

export const HEADER_OFFSET = 0x04;
export const ID_OFFSET = 0x05;

export const ConnectionPacket = sf_packet({
  header: u8,
  port: u16be,
  name: std_string,
  data: DataGhost,
  model_name: std_string,
  current_map: std_string,
  tcp_only: bool,
  color: Color,
  spectator: bool,
});

export const ConfirmConnectionPacket = sf_packet({
  id: u32be,
  nb_ghosts: new PhantomData(Number),
  ghosts: new VariableArray(GhostEntity),
});

export const ConnectPacket = sf_packet({
  header: u8,
  id: u32be,
  name: std_string,
  data: DataGhost,
  model_name: std_string,
  current_map: std_string,
  color: Color,
  spectator: bool,
});

export const PingPacket = sf_packet({
  header: u8,
  id: u32be,
});

export const PingEchoPacket = sf_packet({
  header: u8,
});

export const DisconnectPacket = sf_packet({
  header: u8,
  id: u32be,
});

export const MapChangePacket = sf_packet({
  header: u8,
  id: u32be,
  map_name: std_string,
  ticks: u32be,
  ticks_total: u32be,
});

export const HeartBeatPacket = sf_packet({
  header: u8,
  id: u32be,
  token: u32be,
});

export const MessagePacket = sf_packet({
  header: u8,
  id: u32be,
  message: std_string,
});

export const CountdownPacket = sf_packet({
  header: u8,
  id: u32be,
  step: u8,
  duration: u32be,
  pre_commands: std_string,
  post_commands: std_string,
});

export const COUNTDOWN_STEP_OFFSET = HEADER_OFFSET + CountdownPacket.offsetOf('step');

export const ConfirmCountdownPacket = sf_packet({
  header: u8,
  id: u32be,
  step: u8,
});

export const BulkUpdatePacket = sf_packet({
  header: u8,
  id: u32be,
  count: new PhantomData(Number),
  data: new VariableArray(DataGhostUpdate),
});

export const UpdatePacket = sf_packet({
  header: u8,
  id: u32be,
  data: DataGhost,
});

export const SpeedrunFinishPacket = sf_packet({
  header: u8,
  id: u32be,
  time: std_string,
});

export const ModelChangePacket = sf_packet({
  header: u8,
  id: u32be,
  model_name: std_string,
});

export const ColorChangePacket = sf_packet({
  header: u8,
  id: u32be,
  color: Color,
});
