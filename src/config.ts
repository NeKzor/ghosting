// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { parse } from '@std/toml';
import { IColor } from './protocol.ts';

const CONFIG_FILE = 'config.toml';

export const getConfig = async () => {
  return parse(await Deno.readTextFile(CONFIG_FILE)) as {
    server: {
      hostname: string;
      port: number;
    };
    logging: {
      level: string;
      console: boolean;
      file: boolean;
      filename: string;
    };
    countdown: {
      delay: number;
      pre_commands: string;
      post_commands: string;
    };
    client: {
      name: string;
      model_name: string;
      current_map: string;
      tcp_only: boolean;
      color: IColor;
      spectator: boolean;
    };
  };
};
