// Copyright (c) 2024, NeKz
// SPDX-License-Identifier: MIT

import { type Options, SizedType, u32, UnsizedType } from '@denosaurs/byte-type';

/**
 * Variable Length Array (VLA).
 */
export class VariableArray<T> extends UnsizedType<T[]> {
  constructor(readonly type: UnsizedType<T>) {
    super(type.byteAlignment);
  }

  readPacked(dt: DataView, options: Options = { byteOffset: 0 }): T[] {
    const length = u32.readPacked(dt, options);

    if (length === 0) return [];
    const result = new Array(length);
    const { type } = this;

    for (let i = 0; i < result.length; i++) {
      result[i] = type.readPacked(dt, options);
    }

    return result;
  }

  read(dt: DataView, options: Options = { byteOffset: 0 }): T[] {
    const length = u32.read(dt, options);

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
    u32.writePacked(length, dt, options);

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
    u32.write(length, dt, options);

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
