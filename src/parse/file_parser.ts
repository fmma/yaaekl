import { type } from "../ast/type";
import { parse_error } from "../error/parse_error";
import { parse_error_type } from "../error/parse_error_type";
import { i_token_iterator } from "../tokenize/i_token_iterator";
import { token } from "../tokenize/token";
import { token_type } from "../tokenize/token_type";
import { type_parser } from "./type_parser";

export class file_parser {

    constructor(readonly type_parser: type_parser) { }

    imports: any;
    generics: any;
    interfaces: any;
    members: any[] = [];

    parse(it: i_token_iterator) {
        while (!it.is_done()) {
            it.directives(
                [it.syntax_context.keywords.generics, (_, it) => this.generics = this._parse_generics(it)],
                [it.syntax_context.keywords.imports, (_, it) => this._parse_imports(it)],
                [it.syntax_context.keywords.interfaces, (_, it) => this._parse_interfaces(it)],
                [token_type.id, (herald, it) => this._parse_member(herald, it)]
            )
        }
    }

    private _parse_generics(it: i_token_iterator): string[] {
        const result: string[] = [];
        for (const tok of it.tokens()) {
            switch (tok.type) {
                case token_type.var:
                    result.push(tok.value ?? '');
                case token_type.eod:
                case token_type.cr:
                case token_type.tab:
                case token_type.untab:
                    break;
                default:
                    throw new parse_error(parse_error_type.unexpected_token_generics, tok);
            }
        }
        console.log('generics', result);
        return result;
    }

    private _parse_imports(it: i_token_iterator): any {
        const result: string[] = [];
        while (!it.is_done()) {
            const tok = it.next();
            switch (tok.type) {
                case token_type.id:
                    result.push(tok.value ?? '');
                    break;
                case token_type.dot:
                    const what = it.next();
                    if (what.type !== token_type.id) {
                        throw new parse_error(parse_error_type.unexpected_token_imports, what);
                    }
                    result[result.length - 1] += '.' + what.value;
                case token_type.eod:
                case token_type.cr:
                case token_type.tab:
                case token_type.untab:
                    break;
                default:
                    throw new parse_error(parse_error_type.unexpected_token_imports, tok);
            }
        }
        console.log('imports', result);
        this.imports = result;
    }

    private _parse_interfaces(it: i_token_iterator): any {
        const result: type[] = [];
        while (true) {
            const peekTok = it.peek();
            if (it.is_done())
                break;
            if (peekTok?.type === token_type.eod ||
                peekTok?.type === token_type.tab ||
                peekTok?.type === token_type.untab) {
                it.next();
                continue;
            }
            result.push(this.type_parser.parse(it));
        }
        console.log('interfaces', JSON.stringify(result, undefined, 2));
        this.imports = result;
    }

    private _parse_member(herald: token, it: i_token_iterator): any {
        let generics: string[] = [];
        let type: type | undefined = undefined;
        it.directives(
            [it.syntax_context.keywords.generics, (_, it) => {
                generics = this._parse_generics(it)
            }],
            [it.syntax_context.keywords.type, (_, it) => {
                type = this.type_parser.parse(it);
                console.log('type', JSON.stringify(type));
            }],
        )
    }
}