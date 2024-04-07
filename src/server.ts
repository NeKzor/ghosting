// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

// deno-lint-ignore-file no-unused-vars require-await

/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
/// <reference lib="deno.unstable" />

import { getConfig } from './config.ts';
import { ServerEvent } from './events.ts';
import { ServerEventType } from './events.ts';
import { CommandEvent, EventType } from './events.ts';
import { installLogger, log } from './logger.ts';
import {
  ConfirmConnectionPacket,
  ConfirmCountdownPacket,
  ConnectionPacket,
  ConnectPacket,
  CountdownPacket,
  DisconnectPacket,
  Header,
  IClient,
  IDataGhost,
  IGhostEntity,
  MapChangePacket,
  MessagePacket,
  PingEchoPacket,
  PingPacket,
  SpeedrunFinishPacket,
} from './protocol.ts';
import { State } from './state.ts';

const { server: { hostname, port }, logging } = await getConfig();

installLogger(logging);

const state = new State();

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
    handleConnection(conn).catch(log.error);
  }
};

const handleConnection = async (conn: Deno.Conn) => {
  try {
    log.info('NEW CONNECTION');
    const connection = new Uint8Array(1024);
    await conn.read(connection);

    if (!await checkConnection(conn, connection)) {
      conn.close();
      return;
    }

    const data = new Uint8Array(1024);
    while (await conn.read(data)) {
      const header = data[0]!;
      log.info(conn.remoteAddr, header);

      if (header > Header.LAST) {
        log.info(`Ignoring invalid header value ${header}`);
        return;
      }

      const handler = PacketHandler[header as Header];
      await handler(data, conn);
    }

    conn.close();
  } catch (err) {
    if (!(err instanceof Deno.errors.BrokenPipe) && !(err instanceof Deno.errors.BadResource)) {
      log.error(err);
    }
  }
};

const listenUdp = async () => {
  for await (const [data, address] of udp) {
    log.info(data, address);
  }
};

const broadcast = async (packet: Uint8Array) => {
  const clients: IClient[] = [];

  for (const client of state.clients) {
    try {
      if (client.tcp_socket) {
        await client.tcp_socket.write(packet);
        clients.push(client);
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.BadResource)) {
        log.error(err);
      }
    }
  }

  state.clients = clients;
};

const checkConnection = async (conn: Deno.Conn, data: Uint8Array) => {
  const packet = ConnectionPacket.unpack(data);

  if (!(packet.spectator ? state.acceptingSpectators : state.acceptingPlayers)) {
    return false;
  }

  const remote = conn.remoteAddr as Deno.NetAddr;

  const client = new IClient(
    state.lastId++,
    remote.hostname,
    remote.port,
    packet.name,
    new IDataGhost(
      packet.data.position,
      packet.data.view_angle,
      packet.data.data,
    ),
    packet.model_name,
    packet.current_map,
    conn,
    packet.tcp_only,
    packet.color,
    0,
    false,
    false,
    packet.spectator,
  );

  await conn.write(
    ConfirmConnectionPacket.pack({
      id: client.id,
      nb_ghosts: state.clients.length,
      ghosts: state.clients.map(IGhostEntity.from),
    }),
  );

  await broadcast(
    ConnectPacket.pack({
      header: Header.CONNECT,
      id: client.id,
      name: client.name,
      data: client.data,
      model_name: client.model_name,
      current_map: client.current_map,
      color: client.color,
      spectator: client.spectator,
    }),
  );

  log.info(`New player ${client.name} (${client.spectator ? 'spectator' : 'player'}) @ ${client.ip}:${client.port}`);

  state.clients.push(client);

  return true;
};

const getClientById = (id: number) => {
  return state.clients.find((client) => client.id === id);
};

const disconnectPlayer = async (clientPlayer: IClient, reason: string) => {
  const packet = DisconnectPacket.pack({
    header: Header.DISCONNECT,
    id: clientPlayer.id,
  });

  const clients: IClient[] = [];

  for (const client of state.clients) {
    try {
      if (client.ip !== clientPlayer.ip) {
        if (client.tcp_socket) {
          await client.tcp_socket.write(packet);
          clients.push(client);
        }
      } else {
        log.info(`Player ${clientPlayer.name} has disconnected! Reason: ${reason}`);
        client.tcp_socket?.close();
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.BadResource)) {
        log.error(err);
      }
    }
  }

  state.clients = clients;
};

const handleMapChange = async (data: Uint8Array) => {
  const { id, map_name, ticks, ticks_total } = MapChangePacket.unpack(data);

  const packet = MapChangePacket.pack({
    header: Header.MAP_CHANGE,
    id,
    map_name,
    ticks,
    ticks_total,
  });

  for (const client of state.clients) {
    try {
      if (client.id !== id) {
        await client.tcp_socket?.write(packet);
      } else {
        client.current_map = map_name;
        log.info(`${client.name} is now on ${client.current_map}`);
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.BadResource)) {
        log.error(err);
      }
    }
  }
};

const PacketHandler = {
  [Header.NONE]: async (_data: Uint8Array, _conn: Deno.Conn) => {
    /* no-op */
  },
  [Header.PING]: async (data: Uint8Array, conn: Deno.Conn) => {
    const { id } = PingPacket.unpack(data);

    getClientById(id)?.tcp_socket?.write(
      PingEchoPacket.pack({
        header: Header.PING,
      }),
    );
  },
  [Header.CONNECT]: async (data: Uint8Array, conn: Deno.Conn) => {
    /* no-op */
  },
  [Header.DISCONNECT]: async (data: Uint8Array, conn: Deno.Conn) => {
    const { id } = DisconnectPacket.unpack(data);

    const client = getClientById(id);
    client && await disconnectPlayer(client, 'requested');
  },
  [Header.STOP_SERVER]: async (data: Uint8Array, conn: Deno.Conn) => {
    /* very questionable */
  },
  [Header.MAP_CHANGE]: async (data: Uint8Array, conn: Deno.Conn) => {
    await handleMapChange(data);
  },
  [Header.HEART_BEAT]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Heart_BeatPacket.unpack(data);
  },
  [Header.MESSAGE]: async (data: Uint8Array, conn: Deno.Conn) => {
    const { id, message } = MessagePacket.unpack(data);
    const client = getClientById(id);
    if (client) {
      log.info(`[message] ${client.name}: ${message}`);

      await broadcast(
        MessagePacket.pack({
          header: Header.MESSAGE,
          id,
          message,
        }),
      );
    }
  },
  [Header.COUNTDOWN]: async (data: Uint8Array, conn: Deno.Conn) => {
    const id = data[4]!;
    const client = getClientById(id);
    if (client) {
      client.tcp_socket?.write(
        ConfirmCountdownPacket.pack({
          header: Header.COUNTDOWN,
          id: 0,
          step: 1,
        }),
      );
    }
  },
  [Header.UPDATE]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = UpdatePacket.unpack(data);
  },
  [Header.SPEEDRUN_FINISH]: async (data: Uint8Array, conn: Deno.Conn) => {
    const { id, time } = SpeedrunFinishPacket.unpack(data);
    await broadcast(SpeedrunFinishPacket.pack({
      header: Header.SPEEDRUN_FINISH,
      id,
      time,
    }));
  },
  [Header.MODEL_CHANGE]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Model_ChangePacket.unpack(data);
  },
  [Header.COLOR_CHANGE]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Color_ChangePacket.unpack(data);
  },
};

const emit = (message: ServerEvent) => self.postMessage(message);

self.addEventListener('message', async ({ data }: MessageEvent<CommandEvent>) => {
  switch (data.type) {
    case EventType.GetServerList: {
      emit({ type: ServerEventType.ServerList, clients: state.clients });
      break;
    }
    case EventType.GetServerState: {
      emit({ type: ServerEventType.ServerState, state });
      break;
    }
    case EventType.SetCountdown: {
      state.countdown.preCommands = data.preCommands;
      state.countdown.postCommands = data.postCommands;
      state.countdown.duration = data.duration;
      break;
    }
    case EventType.StartCountdown: {
      const { duration, preCommands, postCommands } = state.countdown;
      await broadcast(
        CountdownPacket.pack({
          header: Header.COUNTDOWN,
          id: 0,
          step: 0,
          duration,
          pre_commands: preCommands,
          post_commands: postCommands,
        }),
      );
      break;
    }
    case EventType.Disconnect: {
      //
      break;
    }
    case EventType.DisconnectId: {
      // TODO
      break;
    }
    case EventType.Ban: {
      // TODO
      break;
    }
    case EventType.BanId: {
      // TODO
      break;
    }
    case EventType.AcceptPlayers: {
      state.acceptingPlayers = true;
      break;
    }
    case EventType.RefusePlayers: {
      state.acceptingPlayers = false;
      break;
    }
    case EventType.AcceptSpectators: {
      state.acceptingSpectators = true;
      break;
    }
    case EventType.RefuseSpectators: {
      state.acceptingSpectators = true;
      break;
    }
    case EventType.ServerMessage: {
      // TODO
      break;
    }
  }
});

await Promise.all([listenTcp(), listenUdp()]);
