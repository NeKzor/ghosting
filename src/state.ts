// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { IClient } from './protocol.ts';

export class State {
  public lastId = 1;
  public clients: IClient[] = [];
  public acceptingSpectators = true;
  public acceptingPlayers = true;
}
