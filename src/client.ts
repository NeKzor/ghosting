// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

// deno-lint-ignore-file no-unused-vars

import { tty } from 'cliffy/ansi/tty.ts';
import { Input } from 'cliffy/prompt/input.ts';
import { Select } from 'cliffy/prompt/select.ts';
import { struct } from './byte_types.ts';
import { getConfig } from './config.ts';
import {
  ConfirmConnectionPacket,
  ConfirmCountdownPacket,
  ConnectionPacket,
  ConnectPacket,
  CountdownPacket,
  DisconnectPacket,
  Header,
  IDataGhost,
  IGhostEntity,
  MapChangePacket,
  MessagePacket,
  PingPacket,
} from './protocol.ts';

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
  ghostPool: [] as IGhostEntity[],
};

const tcp = await (async () => {
  try {
    return await Deno.connect({
      hostname,
      port,
      transport: 'tcp',
    });
  } catch (err) {
    if (err instanceof Deno.errors.ConnectionRefused) {
      console.log(`Unable to connect to ${hostname}:${port}`);
    } else {
      console.error(err);
    }
    Deno.exit(1);
  }
})();

// const udp = Deno.listenDatagram({
//   port: port + 1,
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
        data: 0b0000_0000,
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

  const { id, ghosts } = struct(ConfirmConnectionPacket).unpack(data);

  state.id = id;

  for (const ghost of ghosts) {
    state.ghostPool.push(
      new IGhostEntity(
        ghost.id,
        ghost.name,
        new IDataGhost(
          ghost.data.position,
          ghost.data.view_angle,
          ghost.data.data,
        ),
        ghost.model_name,
        ghost.current_map,
        ghost.color,
        ghost.spectator,
      ),
    );
  }

  listenTcp().catch((err) => {
    console.error(err);
    disconnect();
    Deno.exit(1);
  });

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

  disconnect();
  Deno.exit(0);
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

const getGhostById = (id: number) => {
  return state.ghostPool.find((ghost) => ghost.id === id);
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
    const { id, name, data: dataGhost, model_name, current_map, color, spectator } = struct(ConnectPacket).unpack(data);

    console.log(
      `${name}${spectator ? ' (spectator)' : ''} has connected in ${current_map.length ? current_map : 'the menu'}!`,
    );

    state.ghostPool.push(
      new IGhostEntity(
        id,
        name,
        new IDataGhost(
          dataGhost.position,
          dataGhost.view_angle,
          dataGhost.data,
        ),
        model_name,
        current_map,
        color,
        spectator,
      ),
    );
  },
  [Header.DISCONNECT]: (data: Uint8Array, conn: Deno.Conn) => {
    const { id } = struct(DisconnectPacket).unpack(data);

    let idx = 0;
    let toErase = -1;

    for (const ghost of state.ghostPool) {
      if (ghost.id === id) {
        console.log(
          `${name}${spectator ? ' (spectator)' : ''} has disconnected!`,
        );
        toErase = idx;
        break;
      }
      idx += 1;
    }

    toErase !== -1 && state.ghostPool.splice(toErase, 1);
  },
  [Header.STOP_SERVER]: async (data: Uint8Array, conn: Deno.Conn) => {
    /* no-op */
  },
  [Header.MAP_CHANGE]: (data: Uint8Array, conn: Deno.Conn) => {
    const packet = struct(MapChangePacket).unpack(data);
    const ghost = getGhostById(packet.id);
    if (ghost) {
      const { map_name, ticks } = packet;
      ghost.current_map = map_name;

      if (ticks === 0xffffffff) {
        console.log(`${ghost.name} is now on ${map_name}`);
      } else {
        console.log(`${ghost.name} is now on ${map_name} (${ticks} -> ${packet.ticks_total})`);
      }
    }
  },
  [Header.HEART_BEAT]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(Heart_BeatPacket).unpack(data);
  },
  [Header.MESSAGE]: (data: Uint8Array, conn: Deno.Conn) => {
    const packet = struct(MessagePacket).unpack(data);
    const ghost = getGhostById(packet.id);
    if (ghost) {
      console.log(`${ghost.name}: ${packet.message}`);
    }
  },
  [Header.COUNTDOWN]: async (data: Uint8Array, conn: Deno.Conn) => {
    const step = data[8];
    if (step === 0) {
      const { duration, pre_commands, post_commands } = struct(CountdownPacket).unpack(data);

      console.log(`Countdown setup: ${duration}, ${pre_commands}, ${post_commands}`);

      await conn.write(
        struct(ConfirmCountdownPacket).pack({
          header: Header.COUNTDOWN,
          id: state.id,
          step: 1,
        }),
      );
    } else {
      console.log(`Started countdown!`);
    }
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

  tty.cursorLeft.eraseDown.cursorShow();

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

  console.log('Disconnected');
  disconnected = true;
};

Deno.addSignalListener('SIGINT', disconnect);

try {
  await connect();

  const commands = {
    exit: () => {
      disconnect();
      Deno.exit(0);
    },
    state: () => {
      console.dir(state);
    },
    ping: async () => {
      await sendPing();
    },
    disconnect: async () => {
      await tcp.write(
        struct(DisconnectPacket).pack({
          header: Header.DISCONNECT,
          id: state.id,
        }),
      );
    },
    map_change: async () => {
      await tcp.write(
        struct(MapChangePacket).pack({
          header: Header.MAP_CHANGE,
          id: state.id,
          map_name: 'sp_a1_intro2',
          ticks: Math.floor(Math.random() * 2) ? 0xffffffff : 123,
          ticks_total: 456_789,
        }),
      );
    },
    message: async () => {
      const message: string = await Input.prompt('Enter a message:');
      await tcp.write(
        struct(MessagePacket).pack({
          header: Header.MESSAGE,
          id: state.id,
          message,
        }),
      );
    },
    countdown: async () => {
      await tcp.write(
        struct(CountdownPacket).pack({
          header: Header.MESSAGE,
          id: state.id,
          step: 0,
          duration: 10,
          pre_commands: 'sv_cheats 1',
          post_commands: 'sv_cheats 0',
        }),
      );
    },
  };

  const commandPrompt = {
    message: 'Command:',
    search: true,
    options: Object.keys(commands).map((value) => ({ name: value, value })),
  };

  while (true) {
    const command = await Select.prompt(commandPrompt) as unknown as keyof typeof commands;
    const handler = commands[command];
    handler();
  }
} catch (err) {
  if (!(err instanceof Deno.errors.Interrupted)) {
    console.error(err);
  }
}
