// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { tty } from '@cliffy/ansi';
import { Confirm, Input, Number as NumberInput, Select } from '@cliffy/prompt';
import { CommandEvent, EventType, ServerEvent, ServerEventType } from './events.ts';

const server = new Worker(import.meta.resolve('./server.ts'), { type: 'module' });

const emit = (message: CommandEvent) => server.postMessage(message);

server.addEventListener('message', ({ data }: MessageEvent<ServerEvent>) => {
  switch (data.type) {
    case ServerEventType.ServerList: {
      for (const client of data.clients) {
        console.log(`${client.id} : ${client.ip}:${client.port} : ${client.name}`);
      }
      break;
    }
    case ServerEventType.ServerState: {
      console.dir(data.state);
      break;
    }
  }
});

const commands = {
  exit: {
    description: 'list all the currently connected clients',
    fn: async () => {
      if (!(await Confirm.prompt({ message: 'This will shutdown the server. Are you sure?' }))) {
        return;
      }
      server.terminate();
      Deno.exit(0);
    },
  },
  help: {
    description: 'show this list',
    fn: () => {
      for (const [command, { description }] of Object.entries(commands)) {
        console.log(`${command.padEnd(20, ' ')}${description}`);
      }
    },
  },
  list: {
    description: 'list all the currently connected clients',
    fn: () => {
      emit({ type: EventType.GetServerList });
    },
  },
  state: {
    description: 'dump the current server state',
    fn: () => {
      emit({ type: EventType.GetServerState });
    },
  },
  countdown_set: {
    description: 'set the pre/post cmds and countdown duration',
    fn: async () => {
      const preCommands = await Input.prompt({ message: 'Pre-countdown commands:' });
      const postCommands = await Input.prompt({ message: 'Post-countdown commands:' });
      const duration = await NumberInput.prompt({ message: 'Countdown duration:' });

      if (!(await Confirm.prompt({ message: 'Are the entered values correct?' }))) {
        return;
      }

      emit({ type: EventType.SetCountdown, preCommands, postCommands, duration });
    },
  },
  countdown: {
    description: 'start a countdown',
    fn: () => {
      emit({ type: EventType.StartCountdown });
    },
  },
  disconnect: {
    description: 'disconnect a client by name',
    fn: async () => {
      const name = await Input.prompt({ message: 'Name of client:' });

      if (!(await Confirm.prompt({ message: 'Is the entered value correct?' }))) {
        return;
      }

      emit({ type: EventType.Disconnect, name });
    },
  },
  disconnect_id: {
    description: 'disconnect a client by ID',
    fn: async () => {
      const id = await NumberInput.prompt({ message: 'ID of client:' });

      if (!(await Confirm.prompt({ message: 'Is the entered value correct?' }))) {
        return;
      }

      emit({ type: EventType.DisconnectId, id });
    },
  },
  ban: {
    description: 'ban connections from a certain IP by ghost name',
    fn: async () => {
      const name = await Input.prompt({ message: 'Name of client:' });

      if (!(await Confirm.prompt({ message: 'Is the entered value correct?' }))) {
        return;
      }

      emit({ type: EventType.Ban, name });
    },
  },
  ban_id: {
    description: 'ban connections from a certain IP by ghost ID',
    fn: async () => {
      const id = await NumberInput.prompt({ message: 'ID of client:' });

      if (!(await Confirm.prompt({ message: 'Is the entered value correct?' }))) {
        return;
      }

      emit({ type: EventType.BanId, id });
    },
  },
  accept_players: {
    description: 'start accepting connections from players',
    fn: () => {
      emit({ type: EventType.AcceptPlayers });
    },
  },
  refuse_players: {
    description: 'stop accepting connections from players',
    fn: () => {
      emit({ type: EventType.RefusePlayers });
    },
  },
  accept_spectators: {
    description: 'start accepting connections from spectators',
    fn: () => {
      emit({ type: EventType.AcceptSpectators });
    },
  },
  refuse_spectators: {
    description: 'stop accepting connections from spectators',
    fn: () => {
      emit({ type: EventType.RefuseSpectators });
    },
  },
  server_msg: {
    description: 'send all clients a message from the server',
    fn: async () => {
      const message = await Input.prompt({ message: 'Message to send:' });

      emit({ type: EventType.ServerMessage, message });
    },
  },
};

Deno.addSignalListener('SIGINT', () => {
  tty.cursorLeft.eraseDown.cursorShow();
  Deno.exit(0);
});

const commandPrompt = {
  message: 'Command:',
  options: Object.keys(commands).map((value) => ({ name: value, value })),
};

while (true) {
  const command = await Select.prompt(commandPrompt) as unknown as keyof typeof commands;
  const handler = commands[command];
  await handler.fn();
}
