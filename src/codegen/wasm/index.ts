/**
 * WASM Code Generation Module
 * Exports all WASM-related functionality
 */

export { WasmType, WasmSection, WasmExportKind, WasmOp } from './types';
export type { FuncType, ImportDesc, ExportDesc, Local, FuncBody, GlobalDesc, DataSegment } from './types';

export { WasmBinaryWriter, encodeULEB128, encodeSLEB128 } from './binary';
export { WasmModule, FuncBuilder } from './module';
export { YaaeklCompiler, compileToWasm } from './compiler';
export {
    instantiateWasm,
    instantiateWasmSync,
    callWasmFunc,
    readString,
    writeString,
    readI32,
    writeI32,
    readF64,
    writeF64,
    dumpMemory,
    createDefaultImports,
} from './runtime';
export type { WasmImports, WasmInstance } from './runtime';
