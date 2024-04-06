// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { IClient, IDataGhost } from './protocol.ts';

export class State {
  public lastId = 1;
  public clients: IClient[] = [];
  public acceptingSpectators = true;
  public acceptingPlayers = true;

  addServerAsClient() {
    this.clients.push({
      id: 0,
      ip: '127.0.0.1',
      port: 53_000,
      name: 'Server',
      data: new IDataGhost(
        {
          x: 0,
          y: 0,
          z: 0,
        },
        {
          x: 0,
          y: 0,
          z: 0,
        },
        0b0000_0000,
      ),
      model_name: 'models/props/food_can/food_can_open.mdl',
      current_map: 'sp_a1_intro1',
      tcp_socket: undefined,
      tcp_only: false,
      color: {
        r: 0,
        g: 0,
        b: 0,
      },
      heartbeat_token: 0,
      returned_heartbeat: false,
      missed_last_heartbeat: false,
      spectator: false,
    });
  }
}
