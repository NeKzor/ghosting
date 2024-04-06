// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

// deno-lint-ignore-file no-unused-vars

import { struct } from './byte_types.ts';
import { getConfig } from './config.ts';
import { PingPacket } from './protocol.ts';
import { ConfirmConnectionPacket, ConnectionPacket, ConnectPacket, Header } from './protocol.ts';
import { getAvailablePort } from '@std/net';
import { Select } from 'cliffy/prompt/select.ts';

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

const state = {
  id: -1,
  pingClock: new Date(),
};

const tcp = await Deno.connect({
  hostname,
  port,
  transport: 'tcp',
});

// const udp = Deno.listenDatagram({
//   port: getAvailablePort({ preferredPort: port + 1 }),
//   transport: 'udp',
// });

const _address: Deno.NetAddr = {
  transport: 'udp',
  hostname,
  port,
};

const connect = async () => {
  await tcp.write(
    struct(ConnectionPacket).pack({
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
    }),
  );

  const data = new Uint8Array(1024);
  if (!await tcp.read(data)) {
    return;
  }

  const packet = struct(ConfirmConnectionPacket).unpack(data);
  console.log(packet);
  state.id = packet.id;

  listenTcp().catch(console.error);

  //await udp.send(new Uint8Array(packet), address);
};

const listenTcp = async () => {
  const data = new Uint8Array(1024);
  while (await tcp.read(data)) {
    const header = data[0]!;

    if (header > Header.LAST) {
      console.log(`Ignoring invalid header value ${header}`);
      continue;
    }

    const handler = PacketHandler[header as Header];
    await handler(data, tcp);
  }
};

const sendPing = async () => {
  state.pingClock = new Date();

  await tcp.write(
    struct(PingPacket).pack({
      header: Header.PING,
      id: state.id,
    }),
  );
};

const PacketHandler = {
  [Header.NONE]: async (_data: Uint8Array, _conn: Deno.Conn) => {
    /* no-op */
  },
  [Header.PING]: (data: Uint8Array, conn: Deno.Conn) => {
    const ping = new Date().getTime() - state.pingClock.getTime();
    console.log(`Ping: ${ping}ms`);
  },
  [Header.CONNECT]: (data: Uint8Array, conn: Deno.Conn) => {
    const { name, spectator, current_map } = struct(ConnectPacket).unpack(data);
    console.log(
      `${name}${spectator ? ' (spectator)' : ''} has connected in ${current_map.length ? current_map : 'the menu'}!`,
    );
  },
  [Header.DISCONNECT]: (data: Uint8Array, conn: Deno.Conn) => {
    const { name, spectator } = struct(ConnectPacket).unpack(data);
    console.log(
      `${name}${spectator ? ' (spectator)' : ''} has disconnected!`,
    );
  },
  [Header.STOP_SERVER]: async (data: Uint8Array, conn: Deno.Conn) => {
    /* no-op */
  },
  [Header.MAP_CHANGE]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(Map_ChangePacket).unpack(data);
  },
  [Header.HEART_BEAT]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(Heart_BeatPacket).unpack(data);
  },
  [Header.MESSAGE]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(MessagePacket).unpack(data);
  },
  [Header.COUNTDOWN]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(CountdownPacket).unpack(data);
  },
  [Header.UPDATE]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(UpdatePacket).unpack(data);
  },
  [Header.SPEEDRUN_FINISH]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(Speedrun_FinishPacket).unpack(data);
  },
  [Header.MODEL_CHANGE]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(Model_ChangePacket).unpack(data);
  },
  [Header.COLOR_CHANGE]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(Color_ChangePacket).unpack(data);
  },
};

let disconnected = false;

const disconnect = () => {
  if (disconnected) {
    return;
  }

  try {
    tcp.close();
    // deno-lint-ignore no-empty
  } catch {
  }
  try {
    //udp.close();
    // deno-lint-ignore no-empty
  } catch {
  }

  disconnected = true;
};

Deno.addSignalListener('SIGINT', disconnect);

try {
  await connect();

  while (true) {
    const command: string = await Select.prompt({
      message: 'Command:',
      options: [
        { name: 'exit', value: 'exit' },
        { name: 'ping', value: 'ping' },
      ],
    });

    switch (command) {
      case 'exit': {
        Deno.exit(0);
        break;
      }
      case 'ping': {
        await sendPing();
        break;
      }
      default:
        break;
    }
  }
} catch (err) {
  if (!(err instanceof Deno.errors.Interrupted)) {
    console.error(err);
  }
}
