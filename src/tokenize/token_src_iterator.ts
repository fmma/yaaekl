import { parse_error } from "../error/parse_error";
import { parse_error_type } from "../error/parse_error_type";
import { syntax_context } from "../syntax/syntax_context";
import { i_token_iterator } from "./i_token_iterator";
import { token } from "./token";
import { token_directive_iterator } from "./token_directive_iterator";
import { token_type } from "./token_type";

export class token_src_iterator implements i_token_iterator {
    constructor(readonly syntax_context: syntax_context, readonly src: string) { }

    i = 0;
    end = this.src.length;
    done = false;
    readonly token_stack: token[] = [];
    readonly indent_stack: number[] = [];
    readonly bracket_stack: string[] = [];

    readonly id_regexp = /^[a-zæøå][a-z_æøå]*/;
    readonly ID_regexp = /^[A-ZÆØÅ][A-Z_ÆØÅ]*/;
    readonly string_regexp = /^"(\\.|[^"\\])*"/;
    readonly number_regexp = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;

    readonly matchers = [
        { id: token_type.id, regexp: this.id_regexp },
        { id: token_type.var, regexp: this.ID_regexp },
        { id: token_type.string, regexp: this.string_regexp },
        { id: token_type.number, regexp: this.number_regexp },
    ];

    *tokens(): Iterable<token> {
        while(!this.is_done())
            yield this.next();
    }

    is_done(): boolean {
        return this.done;
    }

    peek(): token | undefined {
        if (this.is_done()) {
            return undefined;
        }
        const token = this.next();
        this.token_stack.push(token);
        return token;
    }

    directives(...fs: [token_type, (herald: token, it: i_token_iterator) => void][]) {
        while (!this.is_done()) {
            const dir = this.next_directive();
            const herald = dir.next();
            for (const f of fs) {
                if (f[0] === herald.type) {
                    f[1](herald, dir);
                }
            }
        }
    }

    next_directive(): i_token_iterator {
        return new token_directive_iterator(this);
    }

    next(): token {
        const { syntax_context, src, i, end, matchers, indent_stack, bracket_stack, token_stack } = this

        if (token_stack.length > 0)
            return token_stack.pop() as token;

        if (i >= end) {
            if (bracket_stack.length > 0) {
                throw new parse_error(parse_error_type.unclosed_bracket, bracket_stack.pop());
            }
            if (indent_stack.length === 0) {
                if(this.done)
                    throw new parse_error(parse_error_type.next_called_after_done);
                this.done = true;
                return { type: token_type.eod, pos: end };
            }
            indent_stack.pop();
            return { type: token_type.untab, pos: end };
        }

        const pos = i;

        const char = src.charAt(i);

        if (char == ' ') {
            this.i += 1;
            return this.next();
        }

        // Open bracket
        if (syntax_context.brackets.get_matching_close_bracket(char)) {
            bracket_stack.push(char);
            this.i += 1;
            return { type: token_type.ob, value: char, pos: pos };
        }

        // Close bracket
        const openBracket = syntax_context.brackets.get_matching_open_bracket(char);
        if (openBracket) {
            if (bracket_stack.pop() !== openBracket) {
                throw new parse_error(parse_error_type.unclosed_bracket, openBracket);
            }
            this.i += 1;
            return { type: token_type.cb, value: char, pos: pos };
        }

        if (syntax_context.binops.binops.includes(char)) {
            this.i += 1;
            return { type: token_type.binop, value: char, pos: pos };
        }

        if (char === ',') {
            this.i += 1;
            return { type: token_type.comma, value: char, pos: pos };
        }

        if (char === '.') {
            this.i += 1;
            return { type: token_type.dot, value: char, pos: pos };
        }

        const substring = src.substring(i);
        for (const m of matchers) {
            const match = m.regexp.exec(substring)?.[0];
            if (match != null && match.length > 0) {
                this.i += match.length;
                if (syntax_context.keywords.keywords.includes(match)) {
                    return { type: match as token_type, pos: pos };
                }
                else {
                    return { type: m.id, value: match, pos: pos };
                }
            }
        }
        if (char == '\n') {
            if (bracket_stack.length > 0) {
                this.i += 1;
                return this.next();
            }

            const match = /\n */.exec(substring)?.[0] as string;
            let top = indent_stack[indent_stack.length - 1] ?? 0;

            const spaces = match.length - 1 ?? 0;
            if (spaces === top) {
                this.i += 1 + spaces;
                return { type: token_type.cr, pos: pos };
            }

            if (spaces > top) {
                this.i += 1 + spaces;
                indent_stack.push(spaces);
                return { type: token_type.tab, pos: pos };
            }

            indent_stack.pop();
            return { type: token_type.untab, pos: pos };
        }

        throw new parse_error(parse_error_type.unrecognized_char, char);
    }
}
