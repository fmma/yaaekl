/**
 * WASM Binary Encoder
 * Handles low-level binary encoding for WebAssembly format
 */

import { WasmType, WasmSection, WasmOp } from './types';

export class WasmBinaryWriter {
    private buffer: number[] = [];

    /**
     * Get the current buffer as Uint8Array
     */
    toBuffer(): Uint8Array {
        return new Uint8Array(this.buffer);
    }

    /**
     * Get current position in buffer
     */
    get position(): number {
        return this.buffer.length;
    }

    /**
     * Write a single byte
     */
    writeByte(byte: number): this {
        this.buffer.push(byte & 0xff);
        return this;
    }

    /**
     * Write multiple bytes
     */
    writeBytes(bytes: number[] | Uint8Array): this {
        for (const byte of bytes) {
            this.buffer.push(byte & 0xff);
        }
        return this;
    }

    /**
     * Write unsigned LEB128 encoded integer
     */
    writeULEB128(value: number): this {
        do {
            let byte = value & 0x7f;
            value >>>= 7;
            if (value !== 0) {
                byte |= 0x80;
            }
            this.buffer.push(byte);
        } while (value !== 0);
        return this;
    }

    /**
     * Write signed LEB128 encoded integer
     */
    writeSLEB128(value: number): this {
        let more = true;
        while (more) {
            let byte = value & 0x7f;
            value >>= 7;
            // Check if there's more to encode
            if ((value === 0 && (byte & 0x40) === 0) ||
                (value === -1 && (byte & 0x40) !== 0)) {
                more = false;
            } else {
                byte |= 0x80;
            }
            this.buffer.push(byte);
        }
        return this;
    }

    /**
     * Write a 32-bit float (IEEE 754)
     */
    writeF32(value: number): this {
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = value;
        const bytes = new Uint8Array(buf);
        return this.writeBytes(bytes);
    }

    /**
     * Write a 64-bit float (IEEE 754)
     */
    writeF64(value: number): this {
        const buf = new ArrayBuffer(8);
        new Float64Array(buf)[0] = value;
        const bytes = new Uint8Array(buf);
        return this.writeBytes(bytes);
    }

    /**
     * Write a UTF-8 encoded string with length prefix
     */
    writeString(str: string): this {
        const bytes = new TextEncoder().encode(str);
        this.writeULEB128(bytes.length);
        return this.writeBytes(bytes);
    }

    /**
     * Write a vector (array) with length prefix
     */
    writeVector<T>(items: T[], writeItem: (item: T) => void): this {
        this.writeULEB128(items.length);
        for (const item of items) {
            writeItem(item);
        }
        return this;
    }

    /**
     * Write a section with automatic size calculation
     */
    writeSection(sectionId: WasmSection, writeContent: () => void): this {
        this.writeByte(sectionId);

        // Write content to temporary buffer to calculate size
        const contentWriter = new WasmBinaryWriter();
        const originalBuffer = this.buffer;
        this.buffer = contentWriter.buffer;
        writeContent();
        this.buffer = originalBuffer;

        // Write size and content
        this.writeULEB128(contentWriter.buffer.length);
        this.writeBytes(contentWriter.buffer);
        return this;
    }

    /**
     * Write WASM magic number and version
     */
    writeHeader(): this {
        // Magic number: \0asm
        this.writeBytes([0x00, 0x61, 0x73, 0x6d]);
        // Version: 1
        this.writeBytes([0x01, 0x00, 0x00, 0x00]);
        return this;
    }

    /**
     * Write a value type
     */
    writeValueType(type: WasmType): this {
        return this.writeByte(type);
    }

    /**
     * Write a function type
     */
    writeFuncType(params: WasmType[], results: WasmType[]): this {
        this.writeByte(0x60);  // func type marker
        this.writeVector(params, (p) => this.writeValueType(p));
        this.writeVector(results, (r) => this.writeValueType(r));
        return this;
    }

    /**
     * Write a limits type (for memory/table)
     */
    writeLimits(min: number, max?: number): this {
        if (max !== undefined) {
            this.writeByte(0x01);  // has max
            this.writeULEB128(min);
            this.writeULEB128(max);
        } else {
            this.writeByte(0x00);  // no max
            this.writeULEB128(min);
        }
        return this;
    }

    /**
     * Write a memory type
     */
    writeMemoryType(min: number, max?: number): this {
        return this.writeLimits(min, max);
    }

    /**
     * Write a global type
     */
    writeGlobalType(type: WasmType, mutable: boolean): this {
        this.writeValueType(type);
        this.writeByte(mutable ? 0x01 : 0x00);
        return this;
    }

    /**
     * Write a block type
     */
    writeBlockType(type: WasmType | null): this {
        if (type === null) {
            this.writeByte(WasmType.void);
        } else {
            this.writeValueType(type);
        }
        return this;
    }
}

/**
 * Encode an unsigned integer as LEB128 bytes
 */
export function encodeULEB128(value: number): number[] {
    const result: number[] = [];
    do {
        let byte = value & 0x7f;
        value >>>= 7;
        if (value !== 0) {
            byte |= 0x80;
        }
        result.push(byte);
    } while (value !== 0);
    return result;
}

/**
 * Encode a signed integer as LEB128 bytes
 */
export function encodeSLEB128(value: number): number[] {
    const result: number[] = [];
    let more = true;
    while (more) {
        let byte = value & 0x7f;
        value >>= 7;
        if ((value === 0 && (byte & 0x40) === 0) ||
            (value === -1 && (byte & 0x40) !== 0)) {
            more = false;
        } else {
            byte |= 0x80;
        }
        result.push(byte);
    }
    return result;
}
