/**
 * WASM Module Builder
 * High-level API for constructing WebAssembly modules
 */

import { WasmBinaryWriter, encodeULEB128, encodeSLEB128 } from './binary';
import {
    WasmType,
    WasmSection,
    WasmExportKind,
    WasmOp,
    FuncType,
    ImportDesc,
    ExportDesc,
    Local,
    FuncBody,
    GlobalDesc,
    DataSegment,
} from './types';

/**
 * High-level WASM module builder
 */
export class WasmModule {
    private types: FuncType[] = [];
    private typeCache: Map<string, number> = new Map();
    private imports: ImportDesc[] = [];
    private functions: number[] = [];  // type indices
    private tables: { refType: WasmType; min: number; max?: number }[] = [];
    private memories: { min: number; max?: number }[] = [];
    private globals: GlobalDesc[] = [];
    private exports: ExportDesc[] = [];
    private startFunc: number | null = null;
    private elements: { tableIdx: number; offset: number[]; funcIndices: number[] }[] = [];
    private bodies: FuncBody[] = [];
    private data: DataSegment[] = [];

    private importFuncCount = 0;
    private importGlobalCount = 0;

    /**
     * Add or get a function type, with deduplication
     */
    addFuncType(params: WasmType[], results: WasmType[]): number {
        const key = `${params.join(',')}:${results.join(',')}`;
        const cached = this.typeCache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const idx = this.types.length;
        this.types.push({ params, results });
        this.typeCache.set(key, idx);
        return idx;
    }

    /**
     * Import a function
     */
    importFunc(module: string, name: string, params: WasmType[], results: WasmType[]): number {
        const typeIdx = this.addFuncType(params, results);
        this.imports.push({ module, name, kind: 'func', typeIdx });
        return this.importFuncCount++;
    }

    /**
     * Import memory
     */
    importMemory(module: string, name: string, min: number, max?: number): void {
        this.imports.push({ module, name, kind: 'memory', memType: { min, max } });
    }

    /**
     * Import a global
     */
    importGlobal(module: string, name: string, type: WasmType, mutable: boolean): number {
        this.imports.push({ module, name, kind: 'global', globalType: { type, mutable } });
        return this.importGlobalCount++;
    }

    /**
     * Add a function
     */
    addFunc(params: WasmType[], results: WasmType[], locals: Local[], code: number[]): number {
        const typeIdx = this.addFuncType(params, results);
        this.functions.push(typeIdx);
        this.bodies.push({ locals, code });
        return this.importFuncCount + this.functions.length - 1;
    }

    /**
     * Add a table
     */
    addTable(refType: WasmType, min: number, max?: number): number {
        const idx = this.tables.length;
        this.tables.push({ refType, min, max });
        return idx;
    }

    /**
     * Add memory
     */
    addMemory(min: number, max?: number): number {
        const idx = this.memories.length;
        this.memories.push({ min, max });
        return idx;
    }

    /**
     * Add a global variable
     */
    addGlobal(type: WasmType, mutable: boolean, initValue: number): number {
        const init = [WasmOp.i32_const, ...encodeSLEB128(initValue), WasmOp.end];
        this.globals.push({ type, mutable, init });
        return this.importGlobalCount + this.globals.length - 1;
    }

    /**
     * Add a global with f64 value
     */
    addGlobalF64(mutable: boolean, initValue: number): number {
        const buf = new ArrayBuffer(8);
        new Float64Array(buf)[0] = initValue;
        const bytes = Array.from(new Uint8Array(buf));
        const init = [WasmOp.f64_const, ...bytes, WasmOp.end];
        this.globals.push({ type: WasmType.f64, mutable, init });
        return this.importGlobalCount + this.globals.length - 1;
    }

    /**
     * Export a function
     */
    exportFunc(name: string, funcIdx: number): void {
        this.exports.push({ name, kind: WasmExportKind.Func, idx: funcIdx });
    }

    /**
     * Export memory
     */
    exportMemory(name: string, memIdx: number = 0): void {
        this.exports.push({ name, kind: WasmExportKind.Memory, idx: memIdx });
    }

    /**
     * Export a global
     */
    exportGlobal(name: string, globalIdx: number): void {
        this.exports.push({ name, kind: WasmExportKind.Global, idx: globalIdx });
    }

    /**
     * Set the start function
     */
    setStart(funcIdx: number): void {
        this.startFunc = funcIdx;
    }

    /**
     * Add a table element segment (for indirect calls)
     */
    addElement(tableIdx: number, offset: number, funcIndices: number[]): void {
        const offsetExpr = [WasmOp.i32_const, ...encodeSLEB128(offset), WasmOp.end];
        this.elements.push({ tableIdx, offset: offsetExpr, funcIndices });
    }

    /**
     * Add a data segment
     */
    addData(memIdx: number, offset: number, data: Uint8Array | string): void {
        const offsetExpr = [WasmOp.i32_const, ...encodeSLEB128(offset), WasmOp.end];
        const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : data;
        this.data.push({ memIdx, offset: offsetExpr, data: bytes });
    }

    /**
     * Compile the module to binary format
     */
    compile(): Uint8Array {
        const writer = new WasmBinaryWriter();
        writer.writeHeader();

        // Type section
        if (this.types.length > 0) {
            writer.writeSection(WasmSection.Type, () => {
                writer.writeVector(this.types, (type) => {
                    writer.writeFuncType(type.params, type.results);
                });
            });
        }

        // Import section
        if (this.imports.length > 0) {
            writer.writeSection(WasmSection.Import, () => {
                writer.writeVector(this.imports, (imp) => {
                    writer.writeString(imp.module);
                    writer.writeString(imp.name);
                    switch (imp.kind) {
                        case 'func':
                            writer.writeByte(0x00);
                            writer.writeULEB128(imp.typeIdx!);
                            break;
                        case 'table':
                            writer.writeByte(0x01);
                            writer.writeByte(imp.tableType!.refType);
                            writer.writeLimits(imp.tableType!.min, imp.tableType!.max);
                            break;
                        case 'memory':
                            writer.writeByte(0x02);
                            writer.writeLimits(imp.memType!.min, imp.memType!.max);
                            break;
                        case 'global':
                            writer.writeByte(0x03);
                            writer.writeGlobalType(imp.globalType!.type, imp.globalType!.mutable);
                            break;
                    }
                });
            });
        }

        // Function section (just type indices)
        if (this.functions.length > 0) {
            writer.writeSection(WasmSection.Function, () => {
                writer.writeVector(this.functions, (typeIdx) => {
                    writer.writeULEB128(typeIdx);
                });
            });
        }

        // Table section
        if (this.tables.length > 0) {
            writer.writeSection(WasmSection.Table, () => {
                writer.writeVector(this.tables, (table) => {
                    writer.writeByte(table.refType);
                    writer.writeLimits(table.min, table.max);
                });
            });
        }

        // Memory section
        if (this.memories.length > 0) {
            writer.writeSection(WasmSection.Memory, () => {
                writer.writeVector(this.memories, (mem) => {
                    writer.writeLimits(mem.min, mem.max);
                });
            });
        }

        // Global section
        if (this.globals.length > 0) {
            writer.writeSection(WasmSection.Global, () => {
                writer.writeVector(this.globals, (global) => {
                    writer.writeGlobalType(global.type, global.mutable);
                    writer.writeBytes(global.init);
                });
            });
        }

        // Export section
        if (this.exports.length > 0) {
            writer.writeSection(WasmSection.Export, () => {
                writer.writeVector(this.exports, (exp) => {
                    writer.writeString(exp.name);
                    writer.writeByte(exp.kind);
                    writer.writeULEB128(exp.idx);
                });
            });
        }

        // Start section
        if (this.startFunc !== null) {
            writer.writeSection(WasmSection.Start, () => {
                writer.writeULEB128(this.startFunc!);
            });
        }

        // Element section
        if (this.elements.length > 0) {
            writer.writeSection(WasmSection.Element, () => {
                writer.writeVector(this.elements, (elem) => {
                    writer.writeULEB128(elem.tableIdx);
                    writer.writeBytes(elem.offset);
                    writer.writeVector(elem.funcIndices, (idx) => {
                        writer.writeULEB128(idx);
                    });
                });
            });
        }

        // Code section
        if (this.bodies.length > 0) {
            writer.writeSection(WasmSection.Code, () => {
                writer.writeVector(this.bodies, (body) => {
                    // Calculate body size
                    const bodyWriter = new WasmBinaryWriter();

                    // Compress locals
                    const compressedLocals: Local[] = [];
                    for (const local of body.locals) {
                        if (compressedLocals.length > 0 &&
                            compressedLocals[compressedLocals.length - 1].type === local.type) {
                            compressedLocals[compressedLocals.length - 1].count += local.count;
                        } else {
                            compressedLocals.push({ ...local });
                        }
                    }

                    bodyWriter.writeVector(compressedLocals, (local) => {
                        bodyWriter.writeULEB128(local.count);
                        bodyWriter.writeValueType(local.type);
                    });
                    bodyWriter.writeBytes(body.code);
                    bodyWriter.writeByte(WasmOp.end);

                    const bodyBytes = bodyWriter.toBuffer();
                    writer.writeULEB128(bodyBytes.length);
                    writer.writeBytes(bodyBytes);
                });
            });
        }

        // Data section
        if (this.data.length > 0) {
            writer.writeSection(WasmSection.Data, () => {
                writer.writeVector(this.data, (seg) => {
                    writer.writeULEB128(seg.memIdx);
                    writer.writeBytes(seg.offset);
                    writer.writeULEB128(seg.data.length);
                    writer.writeBytes(seg.data);
                });
            });
        }

        return writer.toBuffer();
    }
}

/**
 * Helper class for building function bodies
 */
export class FuncBuilder {
    private code: number[] = [];
    private locals: Local[] = [];
    private localCount: number;

    constructor(paramCount: number) {
        this.localCount = paramCount;
    }

    /**
     * Add a local variable
     */
    addLocal(type: WasmType): number {
        this.locals.push({ count: 1, type });
        return this.localCount++;
    }

    /**
     * Add multiple locals of the same type
     */
    addLocals(type: WasmType, count: number): number {
        const firstIdx = this.localCount;
        this.locals.push({ count, type });
        this.localCount += count;
        return firstIdx;
    }

    /**
     * Emit a single opcode
     */
    emit(op: WasmOp): this {
        this.code.push(op);
        return this;
    }

    /**
     * Emit raw bytes
     */
    emitBytes(bytes: number[]): this {
        this.code.push(...bytes);
        return this;
    }

    /**
     * Emit i32.const
     */
    i32Const(value: number): this {
        this.code.push(WasmOp.i32_const);
        this.code.push(...encodeSLEB128(value));
        return this;
    }

    /**
     * Emit i64.const
     */
    i64Const(value: bigint | number): this {
        this.code.push(WasmOp.i64_const);
        this.code.push(...encodeSLEB128(Number(value)));
        return this;
    }

    /**
     * Emit f32.const
     */
    f32Const(value: number): this {
        this.code.push(WasmOp.f32_const);
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = value;
        this.code.push(...new Uint8Array(buf));
        return this;
    }

    /**
     * Emit f64.const
     */
    f64Const(value: number): this {
        this.code.push(WasmOp.f64_const);
        const buf = new ArrayBuffer(8);
        new Float64Array(buf)[0] = value;
        this.code.push(...new Uint8Array(buf));
        return this;
    }

    /**
     * Emit local.get
     */
    localGet(idx: number): this {
        this.code.push(WasmOp.local_get);
        this.code.push(...encodeULEB128(idx));
        return this;
    }

    /**
     * Emit local.set
     */
    localSet(idx: number): this {
        this.code.push(WasmOp.local_set);
        this.code.push(...encodeULEB128(idx));
        return this;
    }

    /**
     * Emit local.tee
     */
    localTee(idx: number): this {
        this.code.push(WasmOp.local_tee);
        this.code.push(...encodeULEB128(idx));
        return this;
    }

    /**
     * Emit global.get
     */
    globalGet(idx: number): this {
        this.code.push(WasmOp.global_get);
        this.code.push(...encodeULEB128(idx));
        return this;
    }

    /**
     * Emit global.set
     */
    globalSet(idx: number): this {
        this.code.push(WasmOp.global_set);
        this.code.push(...encodeULEB128(idx));
        return this;
    }

    /**
     * Emit call
     */
    call(funcIdx: number): this {
        this.code.push(WasmOp.call);
        this.code.push(...encodeULEB128(funcIdx));
        return this;
    }

    /**
     * Emit call_indirect
     */
    callIndirect(typeIdx: number, tableIdx: number = 0): this {
        this.code.push(WasmOp.call_indirect);
        this.code.push(...encodeULEB128(typeIdx));
        this.code.push(...encodeULEB128(tableIdx));
        return this;
    }

    /**
     * Emit a block
     */
    block(type: WasmType | null, buildBlock: () => void): this {
        this.code.push(WasmOp.block);
        this.code.push(type === null ? WasmType.void : type);
        buildBlock();
        this.code.push(WasmOp.end);
        return this;
    }

    /**
     * Emit a loop
     */
    loop(type: WasmType | null, buildLoop: () => void): this {
        this.code.push(WasmOp.loop);
        this.code.push(type === null ? WasmType.void : type);
        buildLoop();
        this.code.push(WasmOp.end);
        return this;
    }

    /**
     * Emit an if-then-else
     */
    if_(type: WasmType | null, buildThen: () => void, buildElse?: () => void): this {
        this.code.push(WasmOp.if_);
        this.code.push(type === null ? WasmType.void : type);
        buildThen();
        if (buildElse) {
            this.code.push(WasmOp.else_);
            buildElse();
        }
        this.code.push(WasmOp.end);
        return this;
    }

    /**
     * Emit br (branch)
     */
    br(depth: number): this {
        this.code.push(WasmOp.br);
        this.code.push(...encodeULEB128(depth));
        return this;
    }

    /**
     * Emit br_if (conditional branch)
     */
    brIf(depth: number): this {
        this.code.push(WasmOp.br_if);
        this.code.push(...encodeULEB128(depth));
        return this;
    }

    /**
     * Emit return
     */
    return_(): this {
        this.code.push(WasmOp.return_);
        return this;
    }

    /**
     * Emit drop
     */
    drop(): this {
        this.code.push(WasmOp.drop);
        return this;
    }

    /**
     * Emit memory load
     */
    i32Load(align: number = 2, offset: number = 0): this {
        this.code.push(WasmOp.i32_load);
        this.code.push(...encodeULEB128(align));
        this.code.push(...encodeULEB128(offset));
        return this;
    }

    /**
     * Emit memory store
     */
    i32Store(align: number = 2, offset: number = 0): this {
        this.code.push(WasmOp.i32_store);
        this.code.push(...encodeULEB128(align));
        this.code.push(...encodeULEB128(offset));
        return this;
    }

    /**
     * Emit f64 memory load
     */
    f64Load(align: number = 3, offset: number = 0): this {
        this.code.push(WasmOp.f64_load);
        this.code.push(...encodeULEB128(align));
        this.code.push(...encodeULEB128(offset));
        return this;
    }

    /**
     * Emit f64 memory store
     */
    f64Store(align: number = 3, offset: number = 0): this {
        this.code.push(WasmOp.f64_store);
        this.code.push(...encodeULEB128(align));
        this.code.push(...encodeULEB128(offset));
        return this;
    }

    // Arithmetic operations
    i32Add(): this { return this.emit(WasmOp.i32_add); }
    i32Sub(): this { return this.emit(WasmOp.i32_sub); }
    i32Mul(): this { return this.emit(WasmOp.i32_mul); }
    i32DivS(): this { return this.emit(WasmOp.i32_div_s); }
    i32DivU(): this { return this.emit(WasmOp.i32_div_u); }
    i32RemS(): this { return this.emit(WasmOp.i32_rem_s); }
    i32And(): this { return this.emit(WasmOp.i32_and); }
    i32Or(): this { return this.emit(WasmOp.i32_or); }
    i32Xor(): this { return this.emit(WasmOp.i32_xor); }
    i32Shl(): this { return this.emit(WasmOp.i32_shl); }
    i32ShrS(): this { return this.emit(WasmOp.i32_shr_s); }
    i32ShrU(): this { return this.emit(WasmOp.i32_shr_u); }

    // Comparison operations
    i32Eqz(): this { return this.emit(WasmOp.i32_eqz); }
    i32Eq(): this { return this.emit(WasmOp.i32_eq); }
    i32Ne(): this { return this.emit(WasmOp.i32_ne); }
    i32LtS(): this { return this.emit(WasmOp.i32_lt_s); }
    i32LtU(): this { return this.emit(WasmOp.i32_lt_u); }
    i32GtS(): this { return this.emit(WasmOp.i32_gt_s); }
    i32GtU(): this { return this.emit(WasmOp.i32_gt_u); }
    i32LeS(): this { return this.emit(WasmOp.i32_le_s); }
    i32LeU(): this { return this.emit(WasmOp.i32_le_u); }
    i32GeS(): this { return this.emit(WasmOp.i32_ge_s); }
    i32GeU(): this { return this.emit(WasmOp.i32_ge_u); }

    // f64 operations
    f64Add(): this { return this.emit(WasmOp.f64_add); }
    f64Sub(): this { return this.emit(WasmOp.f64_sub); }
    f64Mul(): this { return this.emit(WasmOp.f64_mul); }
    f64Div(): this { return this.emit(WasmOp.f64_div); }
    f64Eq(): this { return this.emit(WasmOp.f64_eq); }
    f64Ne(): this { return this.emit(WasmOp.f64_ne); }
    f64Lt(): this { return this.emit(WasmOp.f64_lt); }
    f64Gt(): this { return this.emit(WasmOp.f64_gt); }
    f64Le(): this { return this.emit(WasmOp.f64_le); }
    f64Ge(): this { return this.emit(WasmOp.f64_ge); }
    f64Neg(): this { return this.emit(WasmOp.f64_neg); }
    f64Abs(): this { return this.emit(WasmOp.f64_abs); }
    f64Sqrt(): this { return this.emit(WasmOp.f64_sqrt); }
    f64Floor(): this { return this.emit(WasmOp.f64_floor); }
    f64Ceil(): this { return this.emit(WasmOp.f64_ceil); }
    f64Trunc(): this { return this.emit(WasmOp.f64_trunc); }

    // Conversions
    i32WrapI64(): this { return this.emit(WasmOp.i32_wrap_i64); }
    i64ExtendI32S(): this { return this.emit(WasmOp.i64_extend_i32_s); }
    i64ExtendI32U(): this { return this.emit(WasmOp.i64_extend_i32_u); }
    f64ConvertI32S(): this { return this.emit(WasmOp.f64_convert_i32_s); }
    f64ConvertI32U(): this { return this.emit(WasmOp.f64_convert_i32_u); }
    i32TruncF64S(): this { return this.emit(WasmOp.i32_trunc_f64_s); }
    i32TruncF64U(): this { return this.emit(WasmOp.i32_trunc_f64_u); }

    /**
     * Build and return the function body
     */
    build(): FuncBody {
        return {
            locals: this.locals,
            code: this.code,
        };
    }
}
