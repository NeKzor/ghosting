// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { tty } from '@cliffy/ansi';
import { ArgumentValue, Command, Type, ValidationError } from '@cliffy/command';
import { Input } from '@cliffy/prompt';
import {
  BulkUpdatePacket,
  ColorChangePacket,
  ConfirmConnectionPacket,
  ConfirmCountdownPacket,
  ConnectionPacket,
  ConnectPacket,
  COUNTDOWN_STEP_OFFSET,
  CountdownPacket,
  DisconnectPacket,
  Header,
  HeartBeatPacket,
  IColor,
  IDataGhost,
  IGhostEntity,
  MapChangePacket,
  MessagePacket,
  ModelChangePacket,
  PACKET_BUFFER_SIZE,
  PingPacket,
  SpeedrunFinishPacket,
  TCP_HEADER_OFFSET,
  UDP_HEADER_OFFSET,
  UpdatePacket,
} from './protocol.ts';

const { options } = await new Command()
  .name('ghosting_client')
  .version('0.1.0')
  .description('Client tool for testing ghosting server.')
  .type(
    'color',
    new class extends Type<IColor> {
      public parse({ label, name, value }: ArgumentValue): IColor {
        const color = value.split(',').map((num) => Number(num));
        if (color.length !== 3 || color.some((num) => isNaN(num) || num < 0 || num > 255)) {
          throw new ValidationError(`${label} "${name}" must be a valid color. Use: r,g,b`);
        }

        const [r, g, b] = color as [number, number, number];
        return new IColor(r, g, b);
      }
    }(),
  )
  .globalOption('-a, --address <address:string>', 'The address or the name of the host to connect to.', {
    required: true,
  })
  .globalOption('-p, --port <port:number>', 'The port of the host to connect to.', {
    required: true,
  })
  .globalOption('-n, --name <name:string>', 'Set the name of the client.', {
    required: true,
  })
  .globalOption('-M, --model-name <model_name:string>', 'Set the model name of the client.', {
    default: 'models/props/food_can/food_can_open.mdl',
  })
  .globalOption('-m, --map <map:string>', 'Set the current map of the client.', {
    default: 'sp_a1_intro1',
  })
  .globalOption('-t, --tcp-only', 'Set TCP mode of the client.', {
    default: false,
  })
  .globalOption('-c, --color <color:color>', 'Set the color of the client.', {
    default: new IColor(0, 0, 0),
  })
  .globalOption('-s, --spectator', 'Set client as spectator.', {
    default: false,
  })
  .parse(Deno.args);

const {
  address: hostname,
  port,
  name,
  modelName: model_name,
  map: current_map,
  tcpOnly: tcp_only,
  color,
  spectator,
} = options;

console.log(options);

const state = {
  id: -1,
  pingClock: new Date(),
  ghostPool: [] as IGhostEntity[],
  isConnected: false,
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

const udp = (() => {
  try {
    return Deno.listenDatagram({
      hostname: '0.0.0.0',
      port: tcp.localAddr.port,
      transport: 'udp',
    });
  } catch (err) {
    if (err instanceof Deno.errors.AddrInUse) {
      console.log(err.message);
    } else {
      console.error(err);
    }
    Deno.exit(1);
  }
})();

const address: Deno.NetAddr = {
  transport: 'udp',
  hostname,
  port,
};

const connect = async () => {
  await tcp.write(
    ConnectionPacket.pack({
      header: Header.CONNECT,
      port,
      name,
      data: {
        position: {
          x: 1,
          y: 2,
          z: 3,
        },
        view_angle: {
          x: 4,
          y: 5,
          z: 6,
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

  const data = new Uint8Array(PACKET_BUFFER_SIZE);
  if (!await tcp.read(data)) {
    return;
  }

  const { id, ghosts } = ConfirmConnectionPacket.unpack(data);

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

  console.log('Connected');

  listenTcp().catch((err) => {
    console.error(err);
    disconnect();
    Deno.exit(1);
  });

  listenUdp().catch((err) => {
    console.error(err);
    disconnect();
    Deno.exit(1);
  });
};

const listenTcp = async () => {
  const data = new Uint8Array(PACKET_BUFFER_SIZE);
  while (await tcp.read(data)) {
    const header = data[TCP_HEADER_OFFSET]!;
    //console.log({ data, header });

    if (header > Header.LAST) {
      console.error(`[tcp] Invalid header value ${header}`);
      break;
    }

    const handler = PacketHandler[header as Header];
    await handler(data, false);
  }

  disconnect();
  Deno.exit(0);
};

const listenUdp = async () => {
  const data = new Uint8Array(PACKET_BUFFER_SIZE);
  while (await udp.receive(data)) {
    const header = data[UDP_HEADER_OFFSET]!;
    //console.log({ data, header });

    if (header > Header.LAST) {
      console.error(`[udp] Invalid header value ${header}`);
      break;
    }

    const handler = PacketHandler[header as Header];
    await handler(data, true);
  }

  disconnect();
  Deno.exit(0);
};

const sendPing = async () => {
  state.pingClock = new Date();

  await tcp.write(
    PingPacket.pack({
      header: Header.PING,
      id: state.id,
    }),
  );
};

const sendPlayerData = async () => {
  const ghost = state.ghostPool.at(0);

  const data = (() => {
    if (ghost) {
      return {
        position: {
          x: ghost.data.position.x,
          y: ghost.data.position.y - 64,
          z: ghost.data.position.z,
        },
        view_angle: {
          x: ghost.data.view_angle.x,
          y: ghost.data.view_angle.y,
          z: ghost.data.view_angle.z,
        },
        data: ghost.data.data,
      };
    } else {
      return {
        position: {
          x: Math.floor(Math.random() * 100),
          y: Math.floor(Math.random() * 100),
          z: Math.floor(Math.random() * 100),
        },
        view_angle: {
          x: Math.floor(Math.random() * 90),
          y: Math.floor(Math.random() * 90),
          z: 0,
        },
        data: 0b1100_0000,
      };
    }
  })();

  const packet = UpdatePacket.pack({
    header: Header.UPDATE,
    id: state.id,
    data,
  }, !tcp_only);

  if (tcp_only) {
    await tcp.write(packet);
  } else {
    await udp.send(packet, address);
  }
};

const getGhostById = (id: number) => {
  return state.ghostPool.find((ghost) => ghost.id === id);
};

const PacketHandler = {
  [Header.NONE]: () => {
    /* no-op */
  },
  [Header.PING]: () => {
    const ping = new Date().getTime() - state.pingClock.getTime();
    console.log(`Ping: ${ping}ms`);
  },
  [Header.CONNECT]: (data: Uint8Array) => {
    const { id, name, data: dataGhost, model_name, current_map, color, spectator } = ConnectPacket.unpack(data);

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
  [Header.DISCONNECT]: (data: Uint8Array) => {
    const { id } = DisconnectPacket.unpack(data);

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
  [Header.STOP_SERVER]: async () => {
    /* no-op */
  },
  [Header.MAP_CHANGE]: (data: Uint8Array) => {
    const packet = MapChangePacket.unpack(data);
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
  [Header.HEART_BEAT]: async (data: Uint8Array, isUdp: boolean) => {
    const { token } = HeartBeatPacket.unpack(data, isUdp);

    //console.log({ token, transport: isUdp ? 'udp' : 'tcp' });

    const packet = HeartBeatPacket.pack({
      header: Header.HEART_BEAT,
      id: state.id,
      token,
    }, isUdp);

    if (isUdp) {
      await udp.send(packet, address);
    } else {
      await tcp.write(packet);
    }
  },
  [Header.MESSAGE]: (data: Uint8Array) => {
    const packet = MessagePacket.unpack(data);

    const isServerMessage = packet.id === 0;
    const ghost = isServerMessage ? undefined : getGhostById(packet.id);

    if (ghost || isServerMessage) {
      console.log(`${ghost?.name ?? 'SERVER'}${ghost?.spectator ? ' (spectator)' : ''}: ${packet.message}`);
    }
  },
  [Header.COUNTDOWN]: async (data: Uint8Array, isUdp: boolean) => {
    const step = data[COUNTDOWN_STEP_OFFSET + (isUdp ? UDP_HEADER_OFFSET : TCP_HEADER_OFFSET)]!;
    if (step === 0) {
      const { duration, pre_commands, post_commands } = CountdownPacket.unpack(data);

      console.log(`Countdown setup: ${duration}, ${pre_commands}, ${post_commands}`);

      const packet = ConfirmCountdownPacket.pack({
        header: Header.COUNTDOWN,
        id: state.id,
        step: 1,
      }, isUdp);

      if (isUdp) {
        await udp.send(packet, address);
      } else {
        await tcp.write(packet);
      }
    } else {
      console.log(`Started countdown!`);
    }
  },
  [Header.UPDATE]: (data: Uint8Array) => {
    const packet = BulkUpdatePacket.unpack(data);
    if (packet.id === 0) {
      for (const { id, data } of packet.data) {
        const ghost = getGhostById(id);
        if (ghost) {
          //console.log('Updating ghost', ghost.id, data);
          ghost.data.position = data.position;
          ghost.data.view_angle = data.view_angle;
          ghost.data.data = data.data;
        }
      }
    }
  },
  [Header.SPEEDRUN_FINISH]: (data: Uint8Array) => {
    const packet = SpeedrunFinishPacket.unpack(data);
    const ghost = getGhostById(packet.id);
    if (ghost) {
      console.log(`${ghost.name} has finished on ${ghost.current_map} in ${packet.time}`);
    }
  },
  [Header.MODEL_CHANGE]: (data: Uint8Array) => {
    const packet = ModelChangePacket.unpack(data);
    const ghost = getGhostById(packet.id);
    if (ghost) {
      const oldModel = ghost.model_name;
      ghost.model_name = packet.model_name;
      console.log(`${ghost.name} changed model from ${oldModel} to ${ghost.model_name}`);
    }
  },
  [Header.COLOR_CHANGE]: (data: Uint8Array) => {
    const packet = ColorChangePacket.unpack(data);
    const ghost = getGhostById(packet.id);
    if (ghost) {
      const oldColor = ghost.color;
      ghost.color = packet.color;
      console.log(`${ghost.name} changed color from ${Deno.inspect(oldColor)} to ${Deno.inspect(ghost.color)}`);
    }
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
    udp.close();
    // deno-lint-ignore no-empty
  } catch {
  }

  console.log('Disconnected');
  disconnected = true;
};

Deno.addSignalListener('SIGINT', disconnect);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const GHOST_UPDATE_RATE_MS = 50;

const main = async () => {
  state.isConnected = true;

  let lastGhostUpdate = 0;

  while (state.isConnected) {
    const now = performance.now();

    if (now > (lastGhostUpdate + GHOST_UPDATE_RATE_MS)) {
      await sendPlayerData();
      lastGhostUpdate = now;
    }

    await sleep(10);
  }
};

try {
  await connect();

  main().catch((err) => {
    console.error(err);
    disconnect();
    Deno.exit(1);
  });

  const commands = {
    exit: () => {
      disconnect();
      Deno.exit(0);
    },
    commands: () => {
      Object.keys(commands).forEach((command) => console.log(command));
    },
    state: () => {
      console.dir(state);
    },
    ping: async () => {
      await sendPing();
    },
    disconnect: async () => {
      await tcp.write(
        DisconnectPacket.pack({
          header: Header.DISCONNECT,
          id: state.id,
        }),
      );
    },
    stop_server: async () => {
      await tcp.write(
        DisconnectPacket.pack({
          header: Header.STOP_SERVER,
          id: state.id,
        }),
      );
    },
    map_change: async () => {
      const map_name: string = await Input.prompt('Map to change to:');
      await tcp.write(
        MapChangePacket.pack({
          header: Header.MAP_CHANGE,
          id: state.id,
          map_name,
          ticks: Math.floor(Math.random() * 2) ? 0xffffffff : 123,
          ticks_total: 456_789,
        }),
      );
    },
    message: async () => {
      const message: string = await Input.prompt('Enter a message:');
      await tcp.write(
        MessagePacket.pack({
          header: Header.MESSAGE,
          id: state.id,
          message,
        }),
      );
    },
    countdown: async () => {
      await tcp.write(
        CountdownPacket.pack({
          header: Header.MESSAGE,
          id: state.id,
          step: 0,
          duration: 10,
          pre_commands: 'sv_cheats 1',
          post_commands: 'sv_cheats 0',
        }),
      );
    },
    update: async () => {
      await sendPlayerData();
    },
    speedrun_finish: async () => {
      await tcp.write(
        SpeedrunFinishPacket.pack({
          header: Header.SPEEDRUN_FINISH,
          id: state.id,
          time: '12.34',
        }),
      );
    },
    model_change: async () => {
      await tcp.write(
        ModelChangePacket.pack({
          header: Header.MODEL_CHANGE,
          id: state.id,
          model_name: Math.floor(Math.random() * 2)
            ? 'models/props/prop_portalgun.mdl'
            : 'models/props/food_can/food_can_open.mdl',
        }),
      );
    },
    color_change: async () => {
      await tcp.write(
        ColorChangePacket.pack({
          header: Header.COLOR_CHANGE,
          id: state.id,
          color: {
            r: 123,
            g: 132,
            b: 231,
          },
        }),
      );
    },
  };

  const commandPrompt = {
    message: 'Command:',
    search: true,
    suggestions: Object.keys(commands),
  };

  while (true) {
    const command = await Input.prompt(commandPrompt) as unknown as keyof typeof commands;

    const handler = commands[command];
    if (!handler) {
      console.log('Unknown command');
      continue;
    }

    await handler();
  }
} catch (err) {
  if (!(err instanceof Deno.errors.Interrupted)) {
    console.error(err);
  }
}
