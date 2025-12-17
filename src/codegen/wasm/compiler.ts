/**
 * Yaækl to WASM Compiler
 * Compiles Yaækl AST to WebAssembly binary
 */

import { expr } from '../../ast/expr';
import { stmt } from '../../ast/stmt';
import { file } from '../../ast/file';
import { WasmModule, FuncBuilder } from './module';
import { WasmType, WasmOp } from './types';
import { encodeULEB128, encodeSLEB128 } from './binary';

/**
 * Compilation context for tracking variables and scope
 */
interface CompileContext {
    // Variable name -> local index mapping
    locals: Map<string, number>;
    // Captured variables for closures
    captures: Map<string, number>;
    // Function builder for current function
    builder: FuncBuilder;
    // Current function index (for recursion)
    funcIdx: number;
}

/**
 * Closure information
 */
interface ClosureInfo {
    params: string[];
    body: expr;
    captures: string[];
    funcIdx: number;
}

/**
 * Main Yaækl to WASM compiler
 */
export class YaaeklCompiler {
    private module: WasmModule;
    private closures: ClosureInfo[] = [];
    private stringData: Map<string, number> = new Map();
    private stringOffset: number = 1024;  // Start strings after initial memory
    private heapPtr: number = -1;  // Global for heap pointer

    // Runtime function indices
    private allocFn: number = -1;
    private applyFn: number = -1;
    private makeClosureFn: number = -1;

    // Function table for indirect calls
    private funcTable: number[] = [];
    private funcTableIdx: number = 0;

    constructor() {
        this.module = new WasmModule();
    }

    /**
     * Compile a Yaækl file to WASM binary
     */
    compile(ast: file): Uint8Array {
        this.setupRuntime();
        this.collectClosures(ast);
        this.compileClosures();
        this.compileDefinitions(ast);
        this.finalizeModule();
        return this.module.compile();
    }

    /**
     * Set up runtime support (memory, heap allocation, etc.)
     */
    private setupRuntime(): void {
        // Add memory (1 page = 64KB)
        this.module.addMemory(1, 256);
        this.module.exportMemory('memory');

        // Heap pointer global (starts after string data area)
        this.heapPtr = this.module.addGlobal(WasmType.i32, true, 65536);

        // Add function table for indirect calls
        this.funcTableIdx = this.module.addTable(WasmType.funcref, 0, 1024);

        // Alloc function: allocate n bytes on heap, return pointer
        this.allocFn = this.createAllocFunction();

        // Make closure function: create closure struct on heap
        this.makeClosureFn = this.createMakeClosureFunction();
    }

    /**
     * Create heap allocation function
     * alloc(size: i32) -> i32 (pointer)
     */
    private createAllocFunction(): number {
        const builder = new FuncBuilder(1);  // 1 param: size

        // Get current heap pointer
        builder.globalGet(this.heapPtr);

        // Store it as return value
        const ptr = builder.addLocal(WasmType.i32);
        builder.localTee(ptr);

        // Add size to heap pointer
        builder.localGet(0);  // size param
        builder.i32Add();

        // Align to 8 bytes
        builder.i32Const(7);
        builder.i32Add();
        builder.i32Const(-8);  // ~7 in two's complement
        builder.i32And();

        // Update heap pointer
        builder.globalSet(this.heapPtr);

        // Return original pointer
        builder.localGet(ptr);

        const body = builder.build();
        return this.module.addFunc(
            [WasmType.i32],
            [WasmType.i32],
            body.locals,
            body.code
        );
    }

    /**
     * Create closure constructor function
     * makeClosure(funcIdx: i32, numCaptures: i32) -> i32 (closure pointer)
     *
     * Closure memory layout:
     * [0]: function index (i32)
     * [4]: num captures (i32)
     * [8...]: captured values (i32 each)
     */
    private createMakeClosureFunction(): number {
        const builder = new FuncBuilder(2);  // funcIdx, numCaptures

        // Calculate size: 8 + numCaptures * 4
        builder.localGet(1);  // numCaptures
        builder.i32Const(4);
        builder.i32Mul();
        builder.i32Const(8);
        builder.i32Add();

        // Allocate
        builder.call(this.allocFn);

        // Store pointer in local
        const ptr = builder.addLocal(WasmType.i32);
        builder.localTee(ptr);

        // Store function index at offset 0
        builder.localGet(0);  // funcIdx
        builder.i32Store(2, 0);

        // Store num captures at offset 4
        builder.localGet(ptr);
        builder.localGet(1);  // numCaptures
        builder.i32Store(2, 4);

        // Return closure pointer
        builder.localGet(ptr);

        const body = builder.build();
        return this.module.addFunc(
            [WasmType.i32, WasmType.i32],
            [WasmType.i32],
            body.locals,
            body.code
        );
    }

    /**
     * Collect all closures (lambdas) from the AST
     */
    private collectClosures(ast: file): void {
        for (const [name, stmts] of Object.entries(ast.defs)) {
            for (const s of stmts) {
                this.collectClosuresFromStmt(s, new Set());
            }
        }
    }

    /**
     * Recursively collect closures from a statement
     */
    private collectClosuresFromStmt(s: stmt, scope: Set<string>): void {
        switch (s.type) {
            case 'expr':
                this.collectClosuresFromExpr(s.value, scope);
                break;
            case 'assign':
                const [name, stmts] = s.value;
                const newScope = new Set(scope);
                newScope.add(name);
                for (const inner of stmts) {
                    this.collectClosuresFromStmt(inner, newScope);
                }
                break;
        }
    }

    /**
     * Recursively collect closures from an expression
     */
    private collectClosuresFromExpr(e: expr, scope: Set<string>): void {
        switch (e.type) {
            case 'lam': {
                const [params, body] = e.value;
                const paramSet = new Set(params);
                const bodyScope = new Set([...scope, ...params]);

                // Find captured variables
                const captures = this.findCaptures(body, bodyScope, paramSet);

                this.closures.push({
                    params,
                    body,
                    captures: Array.from(captures),
                    funcIdx: -1,  // Will be set during compilation
                });

                // Continue collecting from body
                this.collectClosuresFromExpr(body, bodyScope);
                break;
            }
            case 'app': {
                const [fn, args] = e.value;
                this.collectClosuresFromExpr(fn, scope);
                for (const arg of args) {
                    this.collectClosuresFromExpr(arg, scope);
                }
                break;
            }
            case 'access': {
                const [obj, _field] = e.value;
                this.collectClosuresFromExpr(obj, scope);
                break;
            }
            // var, number, string don't contain nested closures
        }
    }

    /**
     * Find variables that need to be captured in a closure
     */
    private findCaptures(e: expr, scope: Set<string>, params: Set<string>): Set<string> {
        const captures = new Set<string>();

        const visit = (expr: expr): void => {
            switch (expr.type) {
                case 'var':
                    // If it's in scope but not a parameter, it needs capturing
                    if (scope.has(expr.value) && !params.has(expr.value)) {
                        captures.add(expr.value);
                    }
                    break;
                case 'lam':
                    // Don't descend into nested lambdas - they have their own captures
                    break;
                case 'app':
                    const [fn, args] = expr.value;
                    visit(fn);
                    for (const arg of args) {
                        visit(arg);
                    }
                    break;
                case 'access':
                    visit(expr.value[0]);
                    break;
            }
        };

        visit(e);
        return captures;
    }

    /**
     * Compile all collected closures to WASM functions
     */
    private compileClosures(): void {
        for (let i = 0; i < this.closures.length; i++) {
            const closure = this.closures[i];
            closure.funcIdx = this.compileClosureFunction(closure);

            // Add to function table for indirect calls
            this.funcTable.push(closure.funcIdx);
        }
    }

    /**
     * Compile a single closure to a WASM function
     *
     * Closure calling convention:
     * First param is always the closure pointer (for accessing captures)
     * Rest are the actual parameters
     */
    private compileClosureFunction(closure: ClosureInfo): number {
        const numParams = closure.params.length + 1;  // +1 for closure ptr
        const builder = new FuncBuilder(numParams);

        // Set up locals map
        const ctx: CompileContext = {
            locals: new Map(),
            captures: new Map(),
            builder,
            funcIdx: -1,  // Will be set after creation
        };

        // Local 0 is closure pointer
        // Locals 1..n are parameters
        for (let i = 0; i < closure.params.length; i++) {
            ctx.locals.set(closure.params[i], i + 1);
        }

        // Map captures to their offsets in closure struct
        for (let i = 0; i < closure.captures.length; i++) {
            ctx.captures.set(closure.captures[i], i);
        }

        // Compile the body
        this.compileExpr(closure.body, ctx);

        const body = builder.build();
        const params = new Array(numParams).fill(WasmType.i32);
        return this.module.addFunc(params, [WasmType.i32], body.locals, body.code);
    }

    /**
     * Compile top-level definitions
     */
    private compileDefinitions(ast: file): void {
        for (const [name, stmts] of Object.entries(ast.defs)) {
            const funcIdx = this.compileDefinition(name, stmts);
            this.module.exportFunc(name, funcIdx);
        }
    }

    /**
     * Compile a single top-level definition
     */
    private compileDefinition(name: string, stmts: stmt[]): number {
        const builder = new FuncBuilder(0);

        const ctx: CompileContext = {
            locals: new Map(),
            captures: new Map(),
            builder,
            funcIdx: -1,
        };

        // Compile all statements, keeping track of the last expression
        let lastExprCompiled = false;
        for (let i = 0; i < stmts.length; i++) {
            const isLast = i === stmts.length - 1;
            this.compileStmt(stmts[i], ctx, isLast);
            if (isLast) lastExprCompiled = true;
        }

        // If no statements, return 0
        if (!lastExprCompiled) {
            builder.i32Const(0);
        }

        const body = builder.build();
        return this.module.addFunc([], [WasmType.i32], body.locals, body.code);
    }

    /**
     * Compile a statement
     */
    private compileStmt(s: stmt, ctx: CompileContext, isLast: boolean): void {
        switch (s.type) {
            case 'expr':
                this.compileExpr(s.value, ctx);
                if (!isLast) {
                    ctx.builder.drop();
                }
                break;

            case 'assign': {
                const [name, innerStmts] = s.value;

                // Allocate local for the variable
                const localIdx = ctx.builder.addLocal(WasmType.i32);
                ctx.locals.set(name, localIdx);

                // Compile inner statements
                for (let i = 0; i < innerStmts.length; i++) {
                    const innerIsLast = i === innerStmts.length - 1;
                    this.compileStmt(innerStmts[i], ctx, innerIsLast);
                }

                // Store result in local
                ctx.builder.localSet(localIdx);

                // If this assign is the last statement, push the value back
                if (isLast) {
                    ctx.builder.localGet(localIdx);
                }
                break;
            }
        }
    }

    /**
     * Compile an expression
     */
    private compileExpr(e: expr, ctx: CompileContext): void {
        switch (e.type) {
            case 'number':
                this.compileNumber(e.value, ctx);
                break;

            case 'string':
                this.compileString(e.value, ctx);
                break;

            case 'var':
                this.compileVar(e.value, ctx);
                break;

            case 'lam':
                this.compileLambda(e.value, ctx);
                break;

            case 'app':
                this.compileApp(e.value, ctx);
                break;

            case 'access':
                this.compileAccess(e.value, ctx);
                break;
        }
    }

    /**
     * Compile a number literal
     */
    private compileNumber(value: number, ctx: CompileContext): void {
        // Use f64 for numbers, box them for uniformity
        // For simplicity, we'll use i32 with fixed-point or just integers
        if (Number.isInteger(value)) {
            ctx.builder.i32Const(value);
        } else {
            // Box float value: allocate 8 bytes, store f64, return pointer
            // For now, truncate to integer
            ctx.builder.i32Const(Math.trunc(value));
        }
    }

    /**
     * Compile a string literal
     */
    private compileString(value: string, ctx: CompileContext): void {
        let offset = this.stringData.get(value);
        if (offset === undefined) {
            offset = this.stringOffset;
            this.stringData.set(value, offset);
            this.stringOffset += value.length + 1;  // +1 for null terminator
        }
        // Return pointer to string
        ctx.builder.i32Const(offset);
    }

    /**
     * Compile a variable reference
     */
    private compileVar(name: string, ctx: CompileContext): void {
        // Check if it's a local
        const localIdx = ctx.locals.get(name);
        if (localIdx !== undefined) {
            ctx.builder.localGet(localIdx);
            return;
        }

        // Check if it's a captured variable
        const captureIdx = ctx.captures.get(name);
        if (captureIdx !== undefined) {
            // Load from closure struct: closure[8 + captureIdx * 4]
            ctx.builder.localGet(0);  // closure pointer
            ctx.builder.i32Load(2, 8 + captureIdx * 4);
            return;
        }

        // Unknown variable - might be a global or external
        // For now, push 0
        ctx.builder.i32Const(0);
    }

    /**
     * Compile a lambda expression
     */
    private compileLambda(value: [string[], expr], ctx: CompileContext): void {
        const [params, body] = value;

        // Find the closure info for this lambda
        const closureInfo = this.closures.find(
            c => c.params.length === params.length &&
                c.params.every((p, i) => p === params[i])
        );

        if (!closureInfo) {
            // Shouldn't happen if collectClosures worked correctly
            ctx.builder.i32Const(0);
            return;
        }

        // Get function table index
        const tableIdx = this.funcTable.indexOf(closureInfo.funcIdx);

        // Create closure: makeClosure(tableIdx, numCaptures)
        ctx.builder.i32Const(tableIdx);
        ctx.builder.i32Const(closureInfo.captures.length);
        ctx.builder.call(this.makeClosureFn);

        // If there are captures, we need to fill them in
        if (closureInfo.captures.length > 0) {
            const closurePtr = ctx.builder.addLocal(WasmType.i32);
            ctx.builder.localTee(closurePtr);

            // Store each captured value
            for (let i = 0; i < closureInfo.captures.length; i++) {
                const captureName = closureInfo.captures[i];
                ctx.builder.localGet(closurePtr);

                // Get the captured value
                const localIdx = ctx.locals.get(captureName);
                if (localIdx !== undefined) {
                    ctx.builder.localGet(localIdx);
                } else {
                    const captureIdx = ctx.captures.get(captureName);
                    if (captureIdx !== undefined) {
                        ctx.builder.localGet(0);  // closure pointer
                        ctx.builder.i32Load(2, 8 + captureIdx * 4);
                    } else {
                        ctx.builder.i32Const(0);
                    }
                }

                // Store at closure[8 + i * 4]
                ctx.builder.i32Store(2, 8 + i * 4);
            }

            // Return closure pointer
            ctx.builder.localGet(closurePtr);
        }
    }

    /**
     * Compile a function application
     */
    private compileApp(value: [expr, expr[]], ctx: CompileContext): void {
        const [fn, args] = value;

        // Special case: binary operators
        if (fn.type === 'var') {
            const op = fn.value;
            if (args.length === 2) {
                const compiled = this.tryCompileBinOp(op, args[0], args[1], ctx);
                if (compiled) return;
            }
        }

        // General case: closure call

        // Evaluate the function (should return closure pointer)
        this.compileExpr(fn, ctx);
        const closurePtr = ctx.builder.addLocal(WasmType.i32);
        ctx.builder.localSet(closurePtr);

        // Get function index from closure
        ctx.builder.localGet(closurePtr);
        ctx.builder.i32Load(2, 0);

        // Push closure pointer as first argument
        ctx.builder.localGet(closurePtr);

        // Evaluate and push all arguments
        for (const arg of args) {
            this.compileExpr(arg, ctx);
        }

        // Get function type index
        const paramTypes = new Array(args.length + 1).fill(WasmType.i32);
        const typeIdx = this.module.addFuncType(paramTypes, [WasmType.i32]);

        // Call indirect
        ctx.builder.callIndirect(typeIdx, this.funcTableIdx);
    }

    /**
     * Try to compile a binary operator
     */
    private tryCompileBinOp(op: string, left: expr, right: expr, ctx: CompileContext): boolean {
        // Compile operands
        const compileOperands = () => {
            this.compileExpr(left, ctx);
            this.compileExpr(right, ctx);
        };

        switch (op) {
            case '+':
                compileOperands();
                ctx.builder.i32Add();
                return true;
            case '-':
                compileOperands();
                ctx.builder.i32Sub();
                return true;
            case '*':
                compileOperands();
                ctx.builder.i32Mul();
                return true;
            case '/':
                compileOperands();
                ctx.builder.i32DivS();
                return true;
            case '==':
                compileOperands();
                ctx.builder.i32Eq();
                return true;
            case '!=':
                compileOperands();
                ctx.builder.i32Ne();
                return true;
            case '<':
                compileOperands();
                ctx.builder.i32LtS();
                return true;
            case '>':
                compileOperands();
                ctx.builder.i32GtS();
                return true;
            case '<=':
                compileOperands();
                ctx.builder.i32LeS();
                return true;
            case '>=':
                compileOperands();
                ctx.builder.i32GeS();
                return true;
            case '&&':
                compileOperands();
                ctx.builder.i32And();
                return true;
            case '||':
                compileOperands();
                ctx.builder.i32Or();
                return true;
            default:
                return false;
        }
    }

    /**
     * Compile field access
     */
    private compileAccess(value: [expr, string], ctx: CompileContext): void {
        const [obj, field] = value;

        // Compile the object
        this.compileExpr(obj, ctx);

        // For now, just return the object - proper field access would need
        // a runtime type system
        // In a real implementation, we'd look up the field offset in a type descriptor
    }

    /**
     * Finalize the module (add string data, element section, etc.)
     */
    private finalizeModule(): void {
        // Add string data
        for (const [str, offset] of this.stringData) {
            this.module.addData(0, offset, str + '\0');
        }

        // Add element section for function table
        if (this.funcTable.length > 0) {
            this.module.addElement(this.funcTableIdx, 0, this.funcTable);
        }
    }
}

/**
 * Convenience function to compile Yaækl AST to WASM
 */
export function compileToWasm(ast: file): Uint8Array {
    const compiler = new YaaeklCompiler();
    return compiler.compile(ast);
}
