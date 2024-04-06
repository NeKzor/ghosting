// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { tty } from 'cliffy/ansi/tty.ts';
import { Input } from 'cliffy/prompt/input.ts';
import { Select } from 'cliffy/prompt/select.ts';
import { Number as NumberInput } from 'cliffy/prompt/number.ts';
import { Confirm } from 'cliffy/prompt/confirm.ts';
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
  exit: async () => {
    if (!(await Confirm.prompt({ message: 'This will shutdown the server. Are you sure?' }))) {
      return;
    }
    server.terminate();
    Deno.exit(0);
  },
  list: () => {
    emit({ type: EventType.GetServerList });
  },
  state: () => {
    emit({ type: EventType.GetServerState });
  },
  countdown_set: async () => {
    const preCommands = await Input.prompt({ message: 'Pre-countdown commands:' });
    const postCommands = await Input.prompt({ message: 'Post-countdown commands:' });
    const duration = await NumberInput.prompt({ message: 'Countdown duration:' });

    if (!(await Confirm.prompt({ message: 'Are the entered values correct?' }))) {
      return;
    }

    emit({ type: EventType.SetCountdown, preCommands, postCommands, duration });
  },
  countdown: () => {
    emit({ type: EventType.StartCountdown });
  },
  disconnect: () => {
    emit({ type: EventType.Disconnect });
  },
  disconnect_id: async () => {
    const id = await NumberInput.prompt({ message: 'ID of client:' });

    if (!(await Confirm.prompt({ message: 'Is the entered value correct?' }))) {
      return;
    }

    emit({ type: EventType.DisconnectId, id });
  },
  ban: () => {
    emit({ type: EventType.Ban });
  },
  ban_id: async () => {
    const id = await NumberInput.prompt({ message: 'ID of client:' });

    if (!(await Confirm.prompt({ message: 'Is the entered value correct?' }))) {
      return;
    }

    emit({ type: EventType.BanId, id });
  },
  accept_players: () => {
    emit({ type: EventType.AcceptPlayers });
  },
  refuse_players: () => {
    emit({ type: EventType.RefusePlayers });
  },
  accept_spectators: () => {
    emit({ type: EventType.AcceptSpectators });
  },
  refuse_spectators: () => {
    emit({ type: EventType.RefuseSpectators });
  },
  server_msg: async () => {
    const message = await Input.prompt({ message: 'Message to send:' });

    if (!(await Confirm.prompt({ message: 'Is the entered value correct?' }))) {
      return;
    }

    emit({ type: EventType.ServerMessage, message });
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
  await handler();
}
