/**
 * WASM Code Generation Tests
 * Tests the Yaækl to WASM compiler
 */

import { WasmModule, FuncBuilder } from '../src/codegen/wasm/module';
import { WasmType } from '../src/codegen/wasm/types';
import { instantiateWasmSync, callWasmFunc } from '../src/codegen/wasm/runtime';
import { YaaeklCompiler } from '../src/codegen/wasm/compiler';
import { file } from '../src/ast/file';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        testsPassed++;
    } catch (e) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${e}`);
        testsFailed++;
    }
}

function assertEqual(actual: any, expected: any, message?: string) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
}

// Test 1: Basic WASM module construction
console.log('\n=== WASM Module Builder Tests ===');

test('Create empty module', () => {
    const mod = new WasmModule();
    const binary = mod.compile();
    assertEqual(binary[0], 0x00, 'Magic byte 0');
    assertEqual(binary[1], 0x61, 'Magic byte 1 (a)');
    assertEqual(binary[2], 0x73, 'Magic byte 2 (s)');
    assertEqual(binary[3], 0x6d, 'Magic byte 3 (m)');
    assertEqual(binary[4], 0x01, 'Version 1');
});

test('Create module with memory', () => {
    const mod = new WasmModule();
    mod.addMemory(1, 10);
    mod.exportMemory('memory');
    const binary = mod.compile();
    const instance = instantiateWasmSync(binary);
    assertEqual(instance.exports.memory instanceof WebAssembly.Memory, true, 'Has memory');
});

test('Create simple add function', () => {
    const mod = new WasmModule();

    const builder = new FuncBuilder(2);  // 2 params
    builder.localGet(0);
    builder.localGet(1);
    builder.i32Add();

    const body = builder.build();
    const funcIdx = mod.addFunc(
        [WasmType.i32, WasmType.i32],
        [WasmType.i32],
        body.locals,
        body.code
    );
    mod.exportFunc('add', funcIdx);

    const binary = mod.compile();
    const instance = instantiateWasmSync(binary);
    const result = callWasmFunc(instance, 'add', 3, 4);
    assertEqual(result, 7, 'add(3, 4) = 7');
});

test('Create function with locals', () => {
    const mod = new WasmModule();

    // Function that computes (a + b) * 2
    const builder = new FuncBuilder(2);  // 2 params: a, b
    const sum = builder.addLocal(WasmType.i32);

    builder.localGet(0);  // a
    builder.localGet(1);  // b
    builder.i32Add();
    builder.localSet(sum);

    builder.localGet(sum);
    builder.i32Const(2);
    builder.i32Mul();

    const body = builder.build();
    const funcIdx = mod.addFunc(
        [WasmType.i32, WasmType.i32],
        [WasmType.i32],
        body.locals,
        body.code
    );
    mod.exportFunc('compute', funcIdx);

    const binary = mod.compile();
    const instance = instantiateWasmSync(binary);
    const result = callWasmFunc(instance, 'compute', 3, 4);
    assertEqual(result, 14, 'compute(3, 4) = 14');
});

test('Create function with conditionals', () => {
    const mod = new WasmModule();

    // Function that returns max(a, b)
    const builder = new FuncBuilder(2);

    builder.localGet(0);
    builder.localGet(1);
    builder.i32GtS();
    builder.if_(WasmType.i32, () => {
        builder.localGet(0);
    }, () => {
        builder.localGet(1);
    });

    const body = builder.build();
    const funcIdx = mod.addFunc(
        [WasmType.i32, WasmType.i32],
        [WasmType.i32],
        body.locals,
        body.code
    );
    mod.exportFunc('max', funcIdx);

    const binary = mod.compile();
    const instance = instantiateWasmSync(binary);

    assertEqual(callWasmFunc(instance, 'max', 5, 3), 5, 'max(5, 3) = 5');
    assertEqual(callWasmFunc(instance, 'max', 2, 7), 7, 'max(2, 7) = 7');
    assertEqual(callWasmFunc(instance, 'max', 4, 4), 4, 'max(4, 4) = 4');
});

test('Create function with globals', () => {
    const mod = new WasmModule();

    // Add a mutable global counter
    const counter = mod.addGlobal(WasmType.i32, true, 0);

    // Function that increments and returns counter
    const builder = new FuncBuilder(0);
    builder.globalGet(counter);
    builder.i32Const(1);
    builder.i32Add();
    builder.globalSet(counter);
    builder.globalGet(counter);

    const body = builder.build();
    const funcIdx = mod.addFunc([], [WasmType.i32], body.locals, body.code);
    mod.exportFunc('increment', funcIdx);

    const binary = mod.compile();
    const instance = instantiateWasmSync(binary);

    assertEqual(callWasmFunc(instance, 'increment'), 1, 'First increment = 1');
    assertEqual(callWasmFunc(instance, 'increment'), 2, 'Second increment = 2');
    assertEqual(callWasmFunc(instance, 'increment'), 3, 'Third increment = 3');
});

test('Create module with memory operations', () => {
    const mod = new WasmModule();
    mod.addMemory(1);

    // Store function: memory[addr] = value
    const storeBuilder = new FuncBuilder(2);  // addr, value
    storeBuilder.localGet(0);  // addr
    storeBuilder.localGet(1);  // value
    storeBuilder.i32Store(2, 0);

    const storeBody = storeBuilder.build();
    const storeFunc = mod.addFunc(
        [WasmType.i32, WasmType.i32],
        [],
        storeBody.locals,
        storeBody.code
    );
    mod.exportFunc('store', storeFunc);

    // Load function: return memory[addr]
    const loadBuilder = new FuncBuilder(1);  // addr
    loadBuilder.localGet(0);
    loadBuilder.i32Load(2, 0);

    const loadBody = loadBuilder.build();
    const loadFunc = mod.addFunc(
        [WasmType.i32],
        [WasmType.i32],
        loadBody.locals,
        loadBody.code
    );
    mod.exportFunc('load', loadFunc);
    mod.exportMemory('memory');

    const binary = mod.compile();
    const instance = instantiateWasmSync(binary);

    callWasmFunc(instance, 'store', 0, 42);
    assertEqual(callWasmFunc(instance, 'load', 0), 42, 'Load stored value');

    callWasmFunc(instance, 'store', 4, 100);
    assertEqual(callWasmFunc(instance, 'load', 4), 100, 'Load second stored value');
    assertEqual(callWasmFunc(instance, 'load', 0), 42, 'First value unchanged');
});

// Test 2: Yaækl Compiler Tests
console.log('\n=== Yaækl Compiler Tests ===');

test('Compile empty file', () => {
    const compiler = new YaaeklCompiler();
    const ast: file = {
        imports: [],
        generics: [],
        interfaces: [],
        types: {},
        defs: {},
    };
    const binary = compiler.compile(ast);
    // Should at least have valid WASM header
    assertEqual(binary[0], 0x00, 'Magic byte');
    assertEqual(binary[1], 0x61, 'Magic a');
    assertEqual(binary[2], 0x73, 'Magic s');
    assertEqual(binary[3], 0x6d, 'Magic m');
});

test('Compile simple number expression', () => {
    const compiler = new YaaeklCompiler();
    const ast: file = {
        imports: [],
        generics: [],
        interfaces: [],
        types: {},
        defs: {
            'answer': [
                { type: 'expr', value: { type: 'number', value: 42 } }
            ]
        },
    };
    const binary = compiler.compile(ast);
    const instance = instantiateWasmSync(binary);
    const result = callWasmFunc(instance, 'answer');
    assertEqual(result, 42, 'answer() = 42');
});

test('Compile arithmetic expression', () => {
    const compiler = new YaaeklCompiler();
    // Represents: main = 10 + 20
    const ast: file = {
        imports: [],
        generics: [],
        interfaces: [],
        types: {},
        defs: {
            'main': [
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '+' },
                            [
                                { type: 'number', value: 10 },
                                { type: 'number', value: 20 }
                            ]
                        ]
                    }
                }
            ]
        },
    };
    const binary = compiler.compile(ast);
    const instance = instantiateWasmSync(binary);
    const result = callWasmFunc(instance, 'main');
    assertEqual(result, 30, 'main() = 30');
});

test('Compile with variable assignment', () => {
    const compiler = new YaaeklCompiler();
    // Represents:
    // main
    //     x = 5
    //     y = 10
    //     x + y
    const ast: file = {
        imports: [],
        generics: [],
        interfaces: [],
        types: {},
        defs: {
            'main': [
                {
                    type: 'assign',
                    value: ['x', [{ type: 'expr', value: { type: 'number', value: 5 } }]]
                },
                {
                    type: 'assign',
                    value: ['y', [{ type: 'expr', value: { type: 'number', value: 10 } }]]
                },
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '+' },
                            [
                                { type: 'var', value: 'x' },
                                { type: 'var', value: 'y' }
                            ]
                        ]
                    }
                }
            ]
        },
    };
    const binary = compiler.compile(ast);
    const instance = instantiateWasmSync(binary);
    const result = callWasmFunc(instance, 'main');
    assertEqual(result, 15, 'main() = 15');
});

test('Compile multiplication and subtraction', () => {
    const compiler = new YaaeklCompiler();
    // Represents: main = 6 * 7
    const ast: file = {
        imports: [],
        generics: [],
        interfaces: [],
        types: {},
        defs: {
            'mul': [
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '*' },
                            [
                                { type: 'number', value: 6 },
                                { type: 'number', value: 7 }
                            ]
                        ]
                    }
                }
            ],
            'sub': [
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '-' },
                            [
                                { type: 'number', value: 100 },
                                { type: 'number', value: 58 }
                            ]
                        ]
                    }
                }
            ]
        },
    };
    const binary = compiler.compile(ast);
    const instance = instantiateWasmSync(binary);
    assertEqual(callWasmFunc(instance, 'mul'), 42, 'mul() = 42');
    assertEqual(callWasmFunc(instance, 'sub'), 42, 'sub() = 42');
});

test('Compile comparison operators', () => {
    const compiler = new YaaeklCompiler();
    const ast: file = {
        imports: [],
        generics: [],
        interfaces: [],
        types: {},
        defs: {
            'testEq': [
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '==' },
                            [{ type: 'number', value: 5 }, { type: 'number', value: 5 }]
                        ]
                    }
                }
            ],
            'testLt': [
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '<' },
                            [{ type: 'number', value: 3 }, { type: 'number', value: 7 }]
                        ]
                    }
                }
            ],
            'testGt': [
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '>' },
                            [{ type: 'number', value: 10 }, { type: 'number', value: 5 }]
                        ]
                    }
                }
            ],
        },
    };
    const binary = compiler.compile(ast);
    const instance = instantiateWasmSync(binary);
    assertEqual(callWasmFunc(instance, 'testEq'), 1, 'testEq() = 1 (true)');
    assertEqual(callWasmFunc(instance, 'testLt'), 1, 'testLt() = 1 (true)');
    assertEqual(callWasmFunc(instance, 'testGt'), 1, 'testGt() = 1 (true)');
});

// Print summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
}
