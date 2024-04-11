// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
/// <reference lib="deno.unstable" />

import { getConfig } from './config.ts';
import { CommandEvent, EventType, ServerEvent, ServerEventType } from './events.ts';
import { installLogger, log } from './logger.ts';
import {
  BulkUpdatePacket,
  ColorChangePacket,
  ConfirmConnectionPacket,
  ConfirmCountdownPacket,
  ConnectionPacket,
  ConnectPacket,
  CountdownPacket,
  DisconnectPacket,
  Header,
  HeartBeatPacket,
  IClient,
  IDataGhost,
  IGhostEntity,
  MapChangePacket,
  MessagePacket,
  ModelChangePacket,
  PACKET_BUFFER_SIZE,
  PingEchoPacket,
  PingPacket,
  SpeedrunFinishPacket,
  TCP_HEADER_OFFSET,
  TCP_ID_OFFSET,
  UDP_HEADER_OFFSET,
  UDP_ID_OFFSET,
  UpdatePacket,
} from './protocol.ts';
import { State } from './state.ts';

const { server: { hostname, port }, logging, countdown } = await getConfig();

if (!installLogger(logging)) {
  Deno.exit(1);
}

const state = new State();
state.countdown.duration = countdown.delay;
state.countdown.preCommands = countdown.pre_commands;
state.countdown.postCommands = countdown.post_commands;

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
    handleTcpConnection(conn).catch(log.error);
  }
};

const listenUdp = async () => {
  for await (const conn of udp) {
    handleUdpConnection(conn).catch(log.error);
  }
};

const handleTcpConnection = async (conn: Deno.Conn) => {
  try {
    const remote = conn.remoteAddr as Deno.NetAddr;

    log.debug(`New TCP connection ${remote.hostname}:${remote.port}`);

    const connection = new Uint8Array(PACKET_BUFFER_SIZE);
    await conn.read(connection);

    if (!await checkConnection(conn, connection)) {
      conn.close();
      return;
    }

    const data = new Uint8Array(PACKET_BUFFER_SIZE);
    while (await conn.read(data)) {
      const header = data[TCP_HEADER_OFFSET]!;

      if (header > Header.LAST) {
        break;
      }

      header !== Header.HEART_BEAT && header !== Header.UPDATE && log.debug(conn.remoteAddr, header);

      const handler = PacketHandler[header as Header];
      await handler(data, false);
    }

    conn.close();
  } catch (err) {
    if (
      !(err instanceof Deno.errors.BrokenPipe) &&
      !(err instanceof Deno.errors.BadResource) &&
      !(err instanceof Deno.errors.Interrupted)
    ) {
      log.error(err);
    }
  }
};

const handleUdpConnection = async ([data, remoteAddr]: [Uint8Array, Deno.Addr]) => {
  try {
    const header = data[UDP_HEADER_OFFSET]!;
    const id = data[UDP_ID_OFFSET]!;

    if (header > Header.LAST) {
      return;
    }

    header !== Header.HEART_BEAT && header !== Header.UPDATE && log.debug(remoteAddr, header);

    const client = getClientById(id);
    if (client) {
      const remote = remoteAddr as Deno.NetAddr;
      client.port = remote.port;
    }

    const handler = PacketHandler[header as Header];
    await handler(data, true);
  } catch (err) {
    if (
      !(err instanceof Deno.errors.BrokenPipe) &&
      !(err instanceof Deno.errors.BadResource) &&
      !(err instanceof Deno.errors.Interrupted)
    ) {
      log.error(err);
    }
  }
};

const broadcast = async (packet: Uint8Array) => {
  for (const client of state.clients) {
    try {
      await client.tcp_socket.write(packet);
    } catch (err) {
      if (!(err instanceof Deno.errors.BadResource) && !(err instanceof Deno.errors.BrokenPipe)) {
        log.error(err);
      }
    }
  }
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
    true,
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

  let index = 0;
  let toErase = -1;

  for (const client of state.clients) {
    try {
      if (client.ip !== clientPlayer.ip) {
        await client.tcp_socket.write(packet);
      } else {
        toErase = index;
        log.info(`Player ${clientPlayer.name} has disconnected! Reason: ${reason}`);
        client.tcp_socket.close();
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.BadResource)) {
        log.error(err);
      }
    }

    index += 1;
  }

  if (toErase !== -1) {
    state.clients.splice(toErase, 1);
  }
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
        await client.tcp_socket.write(packet);
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
  [Header.NONE]: () => {
    /* no-op */
  },
  [Header.PING]: async (data: Uint8Array) => {
    const { id } = PingPacket.unpack(data);

    await getClientById(id)?.tcp_socket.write(
      PingEchoPacket.pack({
        header: Header.PING,
      }),
    );
  },
  [Header.CONNECT]: () => {
    /* no-op */
  },
  [Header.DISCONNECT]: async (data: Uint8Array) => {
    const { id } = DisconnectPacket.unpack(data);

    const client = getClientById(id);
    client && await disconnectPlayer(client, 'requested');
  },
  [Header.STOP_SERVER]: () => {
    /* very questionable */
  },
  [Header.MAP_CHANGE]: async (data: Uint8Array) => {
    await handleMapChange(data);
  },
  [Header.HEART_BEAT]: (data: Uint8Array, isUdp: boolean) => {
    const packet = HeartBeatPacket.unpack(data, isUdp);
    const client = getClientById(packet.id);
    if (client?.heartbeat_token === packet.token) {
      client.returned_heartbeat = true;
    }
  },
  [Header.MESSAGE]: async (data: Uint8Array) => {
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
  [Header.COUNTDOWN]: async (data: Uint8Array, isUdp: boolean) => {
    const id = data[isUdp ? UDP_ID_OFFSET : TCP_ID_OFFSET]!;
    await getClientById(id)?.tcp_socket.write(
      ConfirmCountdownPacket.pack({
        header: Header.COUNTDOWN,
        id: 0,
        step: 1,
      }, isUdp),
    );
  },
  [Header.UPDATE]: (data: Uint8Array, isUdp: boolean) => {
    const packet = UpdatePacket.unpack(data, isUdp);
    const client = getClientById(packet.id);
    if (client) {
      client.data.position = packet.data.position;
      client.data.view_angle = packet.data.view_angle;
      client.data.data = packet.data.data;
    }
  },
  [Header.SPEEDRUN_FINISH]: async (data: Uint8Array) => {
    const { id, time } = SpeedrunFinishPacket.unpack(data);
    await broadcast(SpeedrunFinishPacket.pack({
      header: Header.SPEEDRUN_FINISH,
      id,
      time,
    }));
  },
  [Header.MODEL_CHANGE]: async (data: Uint8Array) => {
    const packet = ModelChangePacket.unpack(data);
    const client = getClientById(packet.id);
    if (client) {
      client.model_name = packet.model_name;

      await broadcast(ModelChangePacket.pack({
        header: Header.MODEL_CHANGE,
        id: client.id,
        model_name: client.model_name,
      }));
    }
  },
  [Header.COLOR_CHANGE]: async (data: Uint8Array) => {
    const packet = ColorChangePacket.unpack(data);
    const client = getClientById(packet.id);
    if (client) {
      client.color = packet.color;

      await broadcast(ColorChangePacket.pack({
        header: Header.COLOR_CHANGE,
        id: client.id,
        color: client.color,
      }));
    }
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
      // TODO
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

const doHeartbeats = async () => {
  for (const client of state.clients) {
    if (!client.returned_heartbeat && client.missed_last_heartbeat) {
      await disconnectPlayer(client, 'missed two heartbeats');
      continue;
    }

    client.heartbeat_token = Math.floor(Math.random() * 2_147_483_647);
    client.missed_last_heartbeat = !client.returned_heartbeat;
    client.returned_heartbeat = false;

    try {
      await client.tcp_socket.write(
        HeartBeatPacket.pack({
          header: Header.HEART_BEAT,
          id: client.id,
          token: client.heartbeat_token,
        }),
      );
    } catch (err) {
      if (!(err instanceof Deno.errors.BadResource) && !(err instanceof Deno.errors.BrokenPipe)) {
        log.error(err);
      }

      await disconnectPlayer(client, 'socket died');
    }
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BULK_UPDATE_RATE_MS = 50;
const TCP_HEARTBEAT_RATE_MS = 5_000;
const UDP_HEARTBEAT_RATE_MS = 1_000;

const main = async () => {
  state.isRunning = true;

  let lastTcpHeartbeat = 0;
  let lastUdpHeartbeat = 0;
  let lastUpdate = 0;

  while (state.isRunning) {
    const now = performance.now();

    if (now > (lastTcpHeartbeat + TCP_HEARTBEAT_RATE_MS)) {
      await doHeartbeats();
      lastTcpHeartbeat = now;
    }

    if (now > (lastUdpHeartbeat + UDP_HEARTBEAT_RATE_MS)) {
      for (const client of state.clients) {
        if (!client.tcp_only) {
          try {
            await udp.send(
              HeartBeatPacket.pack({
                header: Header.HEART_BEAT,
                id: client.id,
                token: client.heartbeat_token,
              }, true),
              {
                transport: 'udp',
                hostname: client.ip,
                port: client.port,
              },
            );
          } catch (err) {
            if (!(err instanceof Deno.errors.BadResource)) {
              log.error(err);
            }
          }
        }
      }
      lastUdpHeartbeat = now;
    }

    if (now > (lastUpdate + BULK_UPDATE_RATE_MS)) {
      const count = state.clients.length;
      const data = state.clients.map(({ id, data }) => ({ id, data }));

      await broadcast(BulkUpdatePacket.pack({
        header: Header.UPDATE,
        id: 0,
        count,
        data,
      }));

      lastUpdate = now;
    }

    await sleep(10);
  }
};

log.info(`Server starting`);

await Promise.all([main(), listenTcp(), listenUdp()]);
