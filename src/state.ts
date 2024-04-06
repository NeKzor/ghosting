// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { IClient } from './protocol.ts';

export class State {
  lastId = 1;
  clients: IClient[] = [];
  acceptingSpectators = true;
  acceptingPlayers = true;
  countdown = {
    preCommands: '',
    postCommands: '',
    duration: 0,
  };
}
