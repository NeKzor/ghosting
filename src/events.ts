// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { IClient } from './protocol.ts';
import { State } from './state.ts';

export enum EventType {
  GetServerList,
  GetServerState,
  SetCountdown,
  StartCountdown,
  Disconnect,
  DisconnectId,
  Ban,
  BanId,
  AcceptPlayers,
  RefusePlayers,
  AcceptSpectators,
  RefuseSpectators,
  ServerMessage,
}

export type GetServerList = {
  type: EventType.GetServerList;
};

export type GetServerState = {
  type: EventType.GetServerState;
};

export type SetCountdown = {
  type: EventType.SetCountdown;
  preCommands: string;
  postCommands: string;
  duration: number;
};

export type StartCountdown = {
  type: EventType.StartCountdown;
};

export type Disconnect = {
  type: EventType.Disconnect;
};

export type DisconnectId = {
  type: EventType.DisconnectId;
  id: number;
};

export type Ban = {
  type: EventType.Ban;
};

export type BanId = {
  type: EventType.BanId;
  id: number;
};

export type AcceptPlayers = {
  type: EventType.AcceptPlayers;
};

export type RefusePlayers = {
  type: EventType.RefusePlayers;
};

export type AcceptSpectators = {
  type: EventType.AcceptSpectators;
};

export type RefuseSpectators = {
  type: EventType.RefuseSpectators;
};

export type ServerMessage = {
  type: EventType.ServerMessage;
  message: string;
};

export type CommandEvent =
  | GetServerList
  | GetServerState
  | SetCountdown
  | StartCountdown
  | Disconnect
  | DisconnectId
  | Ban
  | BanId
  | AcceptPlayers
  | RefusePlayers
  | AcceptSpectators
  | RefuseSpectators
  | ServerMessage;

export enum ServerEventType {
  ServerList,
  ServerState,
}

export type ServerList = {
  type: ServerEventType.ServerList;
  clients: IClient[];
};

export type ServerState = {
  type: ServerEventType.ServerState;
  state: State;
};

export type ServerEvent = ServerList | ServerState;
