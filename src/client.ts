// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { getConfig } from './config.ts';
import { ConfirmConnectionPacket, Struct } from './protocol.ts';
import { ConnectionPacket, Header } from './protocol.ts';

const {
  server: {
    hostname,
    port,
  },
  client: {
    name,
    model_name,
    current_map,
    tcp_only,
    color,
    spectator,
  },
} = await getConfig();

const tcp = await Deno.connect({
  hostname,
  port: 53000,
  transport: 'tcp',
});

const udp = Deno.listenDatagram({
  port: port + 1,
  transport: 'udp',
});

const _address: Deno.NetAddr = {
  transport: 'udp',
  hostname,
  port,
};

const connect = async () => {
  {
    const packet = Struct(ConnectionPacket).pack({
      header: Header.CONNECT,
      port,
      name,
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
        grounded: false,
      },
      model_name,
      current_map,
      tcp_only,
      color,
      spectator,
    });
    console.log(packet);
    await tcp.write(new Uint8Array(packet));
  }
  {
    const data = new Uint8Array(1024);
    if (await tcp.read(data)) {
      const packet = Struct(ConfirmConnectionPacket).unpack(data);
      console.log(packet);
    }
  }
  //await udp.send(new Uint8Array(packet), address);
};

const disconnect = () => {
  tcp.close();
  udp.close();
};

await connect();
disconnect();
