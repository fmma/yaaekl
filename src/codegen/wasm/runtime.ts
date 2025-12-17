/**
 * WASM Runtime Helper
 * Utilities for loading and executing compiled WASM modules
 */

/**
 * Runtime imports provided to WASM modules
 */
export interface WasmImports {
    env?: {
        [key: string]: (...args: number[]) => number | void;
    };
    console?: {
        log: (value: number) => void;
        logString: (ptr: number) => void;
    };
}

/**
 * Result of instantiating a WASM module
 */
export interface WasmInstance {
    exports: {
        memory: WebAssembly.Memory;
        [key: string]: any;
    };
    instance: WebAssembly.Instance;
    module: WebAssembly.Module;
}

/**
 * Default imports for Yaækl runtime
 */
export function createDefaultImports(memory?: WebAssembly.Memory): WasmImports {
    return {
        env: {
            // Print an integer
            print_int: (value: number) => {
                console.log(value);
                return 0;
            },
            // Print a float
            print_float: (value: number) => {
                console.log(value);
                return 0;
            },
        },
        console: {
            log: (value: number) => {
                console.log('WASM:', value);
            },
            logString: (ptr: number) => {
                if (memory) {
                    const bytes = new Uint8Array(memory.buffer, ptr);
                    let str = '';
                    for (let i = 0; bytes[i] !== 0; i++) {
                        str += String.fromCharCode(bytes[i]);
                    }
                    console.log('WASM:', str);
                }
            },
        },
    };
}

/**
 * Load and instantiate a WASM module from binary
 */
export async function instantiateWasm(
    wasmBinary: Uint8Array,
    imports?: WasmImports
): Promise<WasmInstance> {
    const actualImports = imports || createDefaultImports();
    const module = await WebAssembly.compile(wasmBinary as BufferSource);
    const instance = await WebAssembly.instantiate(module, actualImports as any);

    return {
        exports: instance.exports as any,
        instance,
        module,
    };
}

/**
 * Synchronously load and instantiate a WASM module
 */
export function instantiateWasmSync(
    wasmBinary: Uint8Array,
    imports?: WasmImports
): WasmInstance {
    const actualImports = imports || createDefaultImports();
    const module = new WebAssembly.Module(wasmBinary as BufferSource);
    const instance = new WebAssembly.Instance(module, actualImports as any);

    return {
        exports: instance.exports as any,
        instance,
        module,
    };
}

/**
 * Call an exported function from a WASM instance
 */
export function callWasmFunc(
    instance: WasmInstance,
    funcName: string,
    ...args: number[]
): number {
    const func = instance.exports[funcName];
    if (typeof func !== 'function') {
        throw new Error(`Function '${funcName}' not found in WASM exports`);
    }
    return func(...args);
}

/**
 * Read a string from WASM memory
 */
export function readString(memory: WebAssembly.Memory, ptr: number): string {
    const bytes = new Uint8Array(memory.buffer, ptr);
    let str = '';
    for (let i = 0; bytes[i] !== 0 && i < 10000; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return str;
}

/**
 * Write a string to WASM memory
 */
export function writeString(memory: WebAssembly.Memory, ptr: number, str: string): void {
    const bytes = new Uint8Array(memory.buffer, ptr);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i);
    }
    bytes[str.length] = 0;  // Null terminator
}

/**
 * Read an i32 from WASM memory
 */
export function readI32(memory: WebAssembly.Memory, ptr: number): number {
    const view = new DataView(memory.buffer);
    return view.getInt32(ptr, true);  // little-endian
}

/**
 * Write an i32 to WASM memory
 */
export function writeI32(memory: WebAssembly.Memory, ptr: number, value: number): void {
    const view = new DataView(memory.buffer);
    view.setInt32(ptr, value, true);  // little-endian
}

/**
 * Read an f64 from WASM memory
 */
export function readF64(memory: WebAssembly.Memory, ptr: number): number {
    const view = new DataView(memory.buffer);
    return view.getFloat64(ptr, true);  // little-endian
}

/**
 * Write an f64 to WASM memory
 */
export function writeF64(memory: WebAssembly.Memory, ptr: number, value: number): void {
    const view = new DataView(memory.buffer);
    view.setFloat64(ptr, value, true);  // little-endian
}

/**
 * Dump WASM memory as hex for debugging
 */
export function dumpMemory(memory: WebAssembly.Memory, start: number, length: number): string {
    const bytes = new Uint8Array(memory.buffer, start, length);
    let result = '';
    for (let i = 0; i < length; i++) {
        if (i % 16 === 0) {
            if (i > 0) result += '\n';
            result += (start + i).toString(16).padStart(8, '0') + ': ';
        }
        result += bytes[i].toString(16).padStart(2, '0') + ' ';
    }
    return result;
}
