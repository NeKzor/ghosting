// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { getConfig } from './config.ts';
import { ConfirmConnectionPacket } from './protocol.ts';
import { Struct } from './protocol.ts';
import { ConnectionPacket } from './protocol.ts';

const { server: { hostname, port } } = await getConfig();

const tcp = Deno.listen({
  hostname,
  port,
  transport: 'tcp',
});

const udp = Deno.listenDatagram({
  hostname,
  port,
  transport: 'udp',
});

const listenTcp = async () => {
  for await (const conn of tcp) {
    {
      const data = new Uint8Array(1024);
      await conn.read(data);

      const packet = Struct(ConnectionPacket).unpack(data);

      console.log(packet);

      console.log('[server][tcp]', conn.remoteAddr);
    }

    {
      const packet = Struct(ConfirmConnectionPacket).pack({
        nb_ghosts: 1,
        ghosts: [
          {
            id: 1,
            name: 'Anon',
            data: {
              position: {
                x: 0,
                y: 0,
                z: 0,
              },
              view_angle: {
                x: 0,
                y: 0,
                z: 0,
              },
              view_offset: 0,
              grounded: true,
            },
            model_name: 'models/props/food_can/food_can_open.mdl',
            current_map: 'sp_a1_intro4',
            color: {
              r: 0,
              g: 0,
              b: 0,
            },
            spectator: false,
          },
        ],
      });

      await conn.write(new Uint8Array(packet));
    }
  }
};

const listenUdp = async () => {
  for await (const [data, address] of udp) {
    console.log('[server][udp]', data, address);
  }
};

await Promise.all([listenTcp(), listenUdp()]);
