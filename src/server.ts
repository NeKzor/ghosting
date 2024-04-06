// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

// deno-lint-ignore-file no-unused-vars require-await

import { struct } from './byte_types.ts';
import { getConfig } from './config.ts';
import { ConfirmConnectionPacket, ConnectionPacket, ConnectPacket, Header, IClient, IGhostEntity } from './protocol.ts';
import { State } from './state.ts';

const { server: { hostname, port } } = await getConfig();

const state = new State();

state.addServerAsClient();

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
    handleConnection(conn).catch(console.error);
  }
};

const handleConnection = async (conn: Deno.Conn) => {
  try {
    console.log('NEW CONNECTION');
    const connection = new Uint8Array(1024);
    await conn.read(connection);

    if (!await checkConnection(conn, connection)) {
      conn.close();
      return;
    }

    const data = new Uint8Array(1024);
    while (await conn.read(data)) {
      const header = data[0]!;
      console.log(conn, header);

      if (header > Header.LAST) {
        console.log(`Ignoring invalid header value ${header}`);
        return;
      }

      const handler = PacketHandler[header as Header];
      await handler(data, conn);
    }

    conn.close();
  } catch (err) {
    if (!(err instanceof Deno.errors.BrokenPipe)) {
      console.error(err);
    }
  }
};

const listenUdp = async () => {
  for await (const [data, address] of udp) {
    console.log(data, address);
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
        console.error(err);
      }
    }
  }

  state.clients = clients;
};

const checkConnection = async (conn: Deno.Conn, data: Uint8Array) => {
  const packet = struct(ConnectionPacket).unpack(data);

  if (!(packet.spectator ? state.acceptingSpectators : state.acceptingPlayers)) {
    return false;
  }

  const remote = conn.remoteAddr as Deno.NetAddr;

  const client = new IClient(
    state.lastId++,
    remote.hostname,
    remote.port,
    packet.name,
    packet.data,
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
    struct(ConfirmConnectionPacket).pack({
      id: client.id,
      nb_ghosts: state.clients.length,
      ghosts: state.clients.map(IGhostEntity.from),
    }),
  );

  await broadcast(
    struct(ConnectPacket).pack({
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

  //console.log(`New client:`, client);

  state.clients.push(client);

  return true;
};

const PacketHandler = {
  [Header.NONE]: async (_data: Uint8Array, _conn: Deno.Conn) => {
    /* no-op */
  },
  [Header.PING]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO: Implement ping clock
    console.log(`Ping: ${0}ms`);
  },
  [Header.CONNECT]: async (data: Uint8Array, conn: Deno.Conn) => {
    /* no-op */
  },
  [Header.DISCONNECT]: async (data: Uint8Array, conn: Deno.Conn) => {
    console.log(`Disconnect`);
    // TODO
    //const packet = Struct(DisconnectPacket).unpack(data);
  },
  [Header.STOP_SERVER]: async (data: Uint8Array, conn: Deno.Conn) => {
    // TODO
    //const packet = Struct(Stop_ServerPacket).unpack(data);
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

await Promise.all([listenTcp(), listenUdp()]);
