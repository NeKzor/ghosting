// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { InnerType, type Options, SizedType, Struct, u32be, UnsizedType } from '@denosaurs/byte-type';

/**
 * Variable Length Array (VLA).
 */
export class VariableArray<T> extends UnsizedType<T[]> {
  constructor(readonly type: UnsizedType<T>) {
    super(type.byteAlignment);
  }

  readPacked(dt: DataView, options: Options = { byteOffset: 0 }): T[] {
    const length = u32be.readPacked(dt, options);

    if (length === 0) return [];
    const result = new Array(length);
    const { type } = this;

    for (let i = 0; i < result.length; i++) {
      result[i] = type.readPacked(dt, options);
    }

    return result;
  }

  read(dt: DataView, options: Options = { byteOffset: 0 }): T[] {
    const length = u32be.read(dt, options);

    if (length === 0) return [];
    const result = new Array(length);
    const { type } = this;

    for (let i = 0; i < result.length; i++) {
      result[i] = type.read(dt, options);
    }

    return result;
  }

  writePacked(
    value: T[],
    dt: DataView,
    options: Options = { byteOffset: 0 },
  ): void {
    const length = value.length;
    u32be.writePacked(length, dt, options);

    const { type } = this;
    for (let i = 0; i < length; i++) {
      type.writePacked(value[i]!, dt, options);
    }
  }

  write(
    value: T[],
    dt: DataView,
    options: Options = { byteOffset: 0 },
  ): void {
    const length = value.length;
    u32be.write(length, dt, options);

    const { type } = this;
    for (let i = 0; i < length; i++) {
      type.write(value[i]!, dt, options);
    }
  }
}

/**
 * Zero Sized Type (ZST).
 */
export class PhantomData<T> extends SizedType<T> {
  constructor(readonly type: { new (): T }) {
    super(0, 0);
  }

  readPacked(_dt: DataView, _options?: Options | undefined): T {
    return new this.type();
  }
  writePacked(_value: T, _dt: DataView, _options?: Options | undefined): void {
  }
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/**
 * std::string representation inside a sf::Packet (SFML).
 */
export class StdString extends UnsizedType<string> {
  constructor() {
    super(1);
  }

  readPacked(dt: DataView, options: Options = { byteOffset: 0 }): string {
    const length = u32be.readPacked(dt, options);
    if (!length) {
      return '';
    }

    const start = dt.byteOffset + options.byteOffset;
    const slice = dt.buffer.slice(start, start + length);
    const value = textDecoder.decode(slice);

    super.incrementOffset(options, length);

    return value;
  }

  writePacked(
    value: string,
    dt: DataView,
    options: Options = { byteOffset: 0 },
  ): void {
    u32be.writePacked(value.length, dt, options);

    const slice = new Uint8Array(dt.buffer, dt.byteOffset + options.byteOffset);
    textEncoder.encodeInto(value, slice);

    super.incrementOffset(options, value.length);
  }
}

export const std_string: StdString = new StdString();

/**
 * Serialize/deserialize sf::Packet (SMFL).
 */
export const sf_packet = <
  T extends Record<string, UnsizedType<unknown>>,
  V extends { [K in keyof T]: InnerType<T[K]> } = {
    [K in keyof T]: InnerType<T[K]>;
  },
>(
  layout: T,
  size = 1024,
): {
  layout: T;
  pack: (value: V) => Uint8Array;
  unpack: (data: Uint8Array) => { [K in keyof T]: InnerType<T[K]> };
  offsetOf: (field: keyof V) => number;
} => {
  const input = new Struct(layout);
  return {
    layout,
    pack: (value: V) => {
      const buffer = new ArrayBuffer(size);
      const view = new DataView(buffer);

      const options = { byteOffset: 4 };
      input.writePacked(value, view, options);

      const length = options.byteOffset - 4;
      view.setUint32(0, length, false);

      return new Uint8Array(buffer.slice(0, options.byteOffset));
    },
    unpack: (data: Uint8Array) => {
      return input.readPacked(new DataView(data.buffer), { byteOffset: 4 });
    },
    offsetOf: (field: keyof V) => {
      let offset = 0;
      for (const [key, value] of Object.entries(layout)) {
        if (key === field) {
          return offset;
        }

        if (!('byteSize' in value)) {
          throw new Error(
            `Unable to figure out offset because of unsized type field ${key} which comes before ${field as string}`,
          );
        }

        offset += value.byteAlignment;
      }
      throw new Error('Unreachable!');
    },
  };
};
