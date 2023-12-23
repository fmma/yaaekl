import { type } from "../ast/type";
import { parse_error } from "../error/parse_error";
import { parse_error_type } from "../error/parse_error_type";
import { i_token_iterator } from "../tokenize/i_token_iterator";
import { token_type } from "../tokenize/token_type";

export class type_parser {
    // (a -> b) -> c
    // [[A] B] C
     //
    // a -> (b -> c)
    // [A] [B] C
    //
    parse(it: i_token_iterator): type {
        while (!it.is_done()) {
            const tok = it.next();
            switch (tok.type) {
                case token_type.var:
                    return this._parse_suffix({ type: 'var', value: tok.value ?? '' }, it);
                case token_type.id:
                    return this._parse_suffix({ type: 'file', value: tok.value ?? '' }, it);
                case token_type.ob:
                    if (tok.value == it.syntax_context.brackets.square.open) {
                        const ts = this._parse_comma_list(it);
                        const t = this.parse(it);
                        return {
                            type: 'fun',
                            value: [ts, t]
                        };
                    }
                    else if (tok.value == it.syntax_context.brackets.round.open) {
                        const t = this.parse(it);
                        it.next();
                        return t;
                    }

                default:
                    throw new parse_error(parse_error_type.unexpected_token_type, tok);
            }
        }
        throw new parse_error(parse_error_type.unfinished_type);
    }

    private _parse_comma_list(it: i_token_iterator): type[] {
        const ts: type[] = [];
        while (true) {
            ts.push(this.parse(it));
            const nextTok = it.next();

            if (nextTok.value === it.syntax_context.brackets.square.close) {
                return ts;
            }
            if (nextTok.type !== token_type.comma) {
                throw new parse_error(parse_error_type.unexpected_token_type, ['comma', nextTok]);
            }
        }
    }

    private _parse_suffix(t: type, it: i_token_iterator): type {
        const peekTok = it.peek();
        if (peekTok?.value === it.syntax_context.brackets.square.open) {
            it.next();
            const ts = this._parse_comma_list(it);
            return this._parse_suffix({
                type: 'app',
                value: [t, ts]
            }, it);
        }
        return t;
    }
}