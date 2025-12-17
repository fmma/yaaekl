/**
 * Yaækl - Yet Another ÆbleKage Language
 * Main entry point and exports
 */

// AST types
export * from './ast/expr';
export * from './ast/stmt';
export * from './ast/type';
export * from './ast/file';

// Parsing
export { file_parser } from './parse/file_parser';
export { type_parser } from './parse/type_parser';
export { expr_parser } from './parse/expr_parser';

// Tokenization
export { token_src_iterator } from './tokenize/token_src_iterator';
export { token_directive_iterator } from './tokenize/token_directive_iterator';
export type { token } from './tokenize/token';
export { token_type } from './tokenize/token_type';

// Syntax
export { syntax_context } from './syntax/syntax_context';
export type { syntax_json } from './syntax/json_types/syntax_json';

// Code generation - WASM
export { WasmType, WasmSection, WasmExportKind, WasmOp } from './codegen/wasm/types';
export { WasmBinaryWriter, encodeULEB128, encodeSLEB128 } from './codegen/wasm/binary';
export { WasmModule, FuncBuilder } from './codegen/wasm/module';
export { YaaeklCompiler, compileToWasm } from './codegen/wasm/compiler';

// Errors
export { parse_error } from './error/parse_error';
export { parse_error_type } from './error/parse_error_type';

import { file } from './ast/file';
import { compileToWasm } from './codegen/wasm/compiler';

// Demo - only runs when executed directly
if (require.main === module) {
    console.log('Yaækl Compiler Demo');
    console.log('==================');

    // Create a simple AST directly for demo purposes
    const ast: file = {
        imports: [],
        generics: [],
        interfaces: [],
        types: {},
        defs: {
            'main': [
                { type: 'expr', value: { type: 'number', value: 42 } }
            ]
        }
    };

    console.log('Demo AST:');
    console.log(JSON.stringify(ast, null, 2));

    try {
        const wasm = compileToWasm(ast);
        console.log(`\nCompiled to ${wasm.length} bytes of WASM`);
    } catch (e) {
        console.error('Compilation error:', e);
    }
}
