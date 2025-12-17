#!/usr/bin/env node
/**
 * Yaækl CLI
 * Command-line interface for compiling and running Yaækl programs
 */

import * as fs from 'fs';
import * as yargs from 'yargs';
import { file } from './ast/file';
import { compileToWasm } from './codegen/wasm/compiler';
import { instantiateWasmSync, callWasmFunc, dumpMemory } from './codegen/wasm/runtime';

/**
 * Load AST from a JSON file
 */
function loadAst(inputFile: string): file {
    if (inputFile.endsWith('.json')) {
        const content = fs.readFileSync(inputFile, 'utf-8');
        return JSON.parse(content) as file;
    }
    // For .ae files, we'd need the full parser - for now, throw an error
    throw new Error(
        'Source file parsing is not yet fully implemented. ' +
        'Please provide a JSON AST file instead (.json extension).'
    );
}

/**
 * Compile command - compile AST to WASM
 */
async function compileCommand(inputFile: string, outputFile: string | undefined, options: any) {
    console.log(`Compiling ${inputFile}...`);

    const ast = loadAst(inputFile);

    if (options.ast) {
        console.log('\nAST:');
        console.log(JSON.stringify(ast, null, 2));
    }

    // Compile to WASM
    const wasmBinary = compileToWasm(ast);

    // Determine output file
    const output = outputFile || inputFile.replace(/\.\w+$/, '.wasm');

    // Write WASM binary
    fs.writeFileSync(output, wasmBinary);
    console.log(`Written ${wasmBinary.length} bytes to ${output}`);

    if (options.hex) {
        console.log('\nWASM hex dump (first 256 bytes):');
        let hex = '';
        for (let i = 0; i < Math.min(256, wasmBinary.length); i++) {
            if (i % 16 === 0) {
                if (i > 0) hex += '\n';
                hex += i.toString(16).padStart(4, '0') + ': ';
            }
            hex += wasmBinary[i].toString(16).padStart(2, '0') + ' ';
        }
        console.log(hex);
    }

    return { ast, wasmBinary, output };
}

/**
 * Run command - compile and execute
 */
async function runCommand(inputFile: string, funcName: string, args: number[], options: any) {
    const { wasmBinary } = await compileCommand(inputFile, undefined, { ...options, hex: false });

    console.log(`\nRunning ${funcName}(${args.join(', ')})...`);

    try {
        const instance = instantiateWasmSync(wasmBinary);

        if (options.memory) {
            console.log('\nInitial memory:');
            console.log(dumpMemory(instance.exports.memory, 0, 128));
        }

        const result = callWasmFunc(instance, funcName, ...args);
        console.log(`\nResult: ${result}`);

        if (options.memory) {
            console.log('\nFinal memory:');
            console.log(dumpMemory(instance.exports.memory, 0, 128));
        }

        // List all exports
        if (options.exports) {
            console.log('\nExported functions:');
            for (const [name, value] of Object.entries(instance.exports)) {
                if (typeof value === 'function') {
                    console.log(`  - ${name}`);
                }
            }
        }

        return result;
    } catch (e) {
        console.error('WASM execution error:', e);
        throw e;
    }
}

/**
 * Disassemble command - show WASM structure
 */
async function disasmCommand(inputFile: string, options: any) {
    let wasmBinary: Uint8Array;

    if (inputFile.endsWith('.wasm')) {
        wasmBinary = fs.readFileSync(inputFile);
    } else {
        const result = await compileCommand(inputFile, undefined, { hex: false, ast: false });
        wasmBinary = result.wasmBinary;
    }

    // Simple disassembly - show sections
    console.log('\nWASM Module Structure:');
    console.log('======================');

    const view = new DataView(wasmBinary.buffer, wasmBinary.byteOffset, wasmBinary.byteLength);
    let offset = 0;

    // Magic number
    const magic = view.getUint32(offset, true);
    offset += 4;
    console.log(`Magic: 0x${magic.toString(16)} (${magic === 0x6d736100 ? 'valid' : 'INVALID'})`);

    // Version
    const version = view.getUint32(offset, true);
    offset += 4;
    console.log(`Version: ${version}`);

    const sectionNames: Record<number, string> = {
        0: 'Custom',
        1: 'Type',
        2: 'Import',
        3: 'Function',
        4: 'Table',
        5: 'Memory',
        6: 'Global',
        7: 'Export',
        8: 'Start',
        9: 'Element',
        10: 'Code',
        11: 'Data',
        12: 'DataCount',
    };

    console.log('\nSections:');
    while (offset < wasmBinary.length) {
        const sectionId = wasmBinary[offset++];
        const sectionName = sectionNames[sectionId] || `Unknown(${sectionId})`;

        // Read LEB128 size
        let size = 0;
        let shift = 0;
        let byte;
        do {
            byte = wasmBinary[offset++];
            size |= (byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80);

        console.log(`  [${sectionId}] ${sectionName}: ${size} bytes`);
        offset += size;
    }
}

/**
 * Demo command - run a built-in demo
 */
async function demoCommand() {
    console.log('Yaækl WASM Compiler Demo');
    console.log('========================\n');

    // Create a simple AST
    const ast: file = {
        imports: [],
        generics: [],
        interfaces: [],
        types: {},
        defs: {
            'answer': [
                { type: 'expr', value: { type: 'number', value: 42 } }
            ],
            'add': [
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '+' },
                            [
                                { type: 'number', value: 10 },
                                { type: 'number', value: 32 }
                            ]
                        ]
                    }
                }
            ],
            'complex': [
                {
                    type: 'assign',
                    value: ['x', [{ type: 'expr', value: { type: 'number', value: 6 } }]]
                },
                {
                    type: 'assign',
                    value: ['y', [{ type: 'expr', value: { type: 'number', value: 7 } }]]
                },
                {
                    type: 'expr',
                    value: {
                        type: 'app',
                        value: [
                            { type: 'var', value: '*' },
                            [
                                { type: 'var', value: 'x' },
                                { type: 'var', value: 'y' }
                            ]
                        ]
                    }
                }
            ]
        }
    };

    console.log('AST:');
    console.log(JSON.stringify(ast, null, 2));
    console.log('\n');

    // Compile to WASM
    const wasmBinary = compileToWasm(ast);
    console.log(`Compiled to ${wasmBinary.length} bytes of WASM\n`);

    // Run it
    const instance = instantiateWasmSync(wasmBinary);

    console.log('Exported functions:');
    for (const [name, value] of Object.entries(instance.exports)) {
        if (typeof value === 'function') {
            console.log(`  - ${name}`);
        }
    }

    console.log('\nRunning functions:');
    console.log(`  answer() = ${callWasmFunc(instance, 'answer')}`);
    console.log(`  add() = ${callWasmFunc(instance, 'add')}`);
    console.log(`  complex() = ${callWasmFunc(instance, 'complex')}`);
}

// Main CLI
yargs
    .scriptName('yaaekl')
    .usage('$0 <cmd> [args]')
    .command(
        'compile <input>',
        'Compile a Yaækl AST file to WASM',
        (yargs) => {
            return yargs
                .positional('input', {
                    describe: 'Input JSON AST file',
                    type: 'string',
                })
                .option('output', {
                    alias: 'o',
                    describe: 'Output WASM file',
                    type: 'string',
                })
                .option('ast', {
                    describe: 'Print AST',
                    type: 'boolean',
                    default: false,
                })
                .option('hex', {
                    describe: 'Print WASM hex dump',
                    type: 'boolean',
                    default: false,
                });
        },
        async (argv) => {
            await compileCommand(argv.input as string, argv.output, argv);
        }
    )
    .command(
        'run <input> [func] [args..]',
        'Compile and run a Yaækl program',
        (yargs) => {
            return yargs
                .positional('input', {
                    describe: 'Input JSON AST file',
                    type: 'string',
                })
                .positional('func', {
                    describe: 'Function to call',
                    type: 'string',
                    default: 'main',
                })
                .positional('args', {
                    describe: 'Arguments to pass',
                    type: 'number',
                    array: true,
                    default: [],
                })
                .option('ast', {
                    describe: 'Print AST',
                    type: 'boolean',
                    default: false,
                })
                .option('memory', {
                    describe: 'Dump memory',
                    type: 'boolean',
                    default: false,
                })
                .option('exports', {
                    describe: 'List exports',
                    type: 'boolean',
                    default: false,
                });
        },
        async (argv) => {
            await runCommand(
                argv.input as string,
                argv.func as string,
                (argv.args || []) as number[],
                argv
            );
        }
    )
    .command(
        'disasm <input>',
        'Disassemble a WASM file',
        (yargs) => {
            return yargs.positional('input', {
                describe: 'Input WASM or JSON AST file',
                type: 'string',
            });
        },
        async (argv) => {
            await disasmCommand(argv.input as string, argv);
        }
    )
    .command(
        'demo',
        'Run a built-in demo',
        () => {},
        async () => {
            await demoCommand();
        }
    )
    .demandCommand(1, 'You need at least one command')
    .help()
    .parse();
