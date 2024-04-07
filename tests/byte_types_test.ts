// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';
import { Struct, u32, u8 } from '@denosaurs/byte-type';
import { std_string } from '../src/byte_types.ts';

Deno.test('std_string', () => {
  const buffer = new ArrayBuffer(12);
  const options = { byteOffset: 0 };

  std_string.writePacked('ghosting', new DataView(buffer), options);

  assertEquals(options.byteOffset, 12);

  assertEquals(
    new Uint8Array(buffer),
    // @deno-fmt-ignore
    new Uint8Array([
        0x08, 0x00, 0x00, 0x00,
        0x67, 0x68, 0x6f, 0x73, 0x74, 0x69, 0x6e, 0x67
    ]),
  );

  const str = std_string.readPacked(new DataView(buffer));
  assertEquals(str, 'ghosting');
});

Deno.test('std_string + struct', () => {
  const struct = new Struct({
    header: u8,
    id: u32,
    name: std_string,
    id2: u32,
  });

  const buffer = new ArrayBuffer(21);
  const options = { byteOffset: 0 };

  struct.writePacked(
    {
      header: 1,
      id: 2,
      name: 'ghosting',
      id2: 3,
    },
    new DataView(buffer),
    options,
  );

  assertEquals(options.byteOffset, 21);

  assertEquals(
    new Uint8Array(buffer),
    // @deno-fmt-ignore
    new Uint8Array([
        0x01,
        0x02, 0x00, 0x00, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x67, 0x68, 0x6f, 0x73, 0x74, 0x69, 0x6e, 0x67,
        0x03, 0x00, 0x00, 0x00,
    ]),
  );

  const { header, id, name, id2 } = struct.readPacked(new DataView(buffer));

  assertEquals(header, 1);
  assertEquals(id, 2);
  assertEquals(name, 'ghosting');
  assertEquals(id2, 3);
});
