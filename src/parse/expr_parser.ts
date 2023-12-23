import { expr } from "../ast/expr";
import { parse_error } from "../error/parse_error";
import { parse_error_type } from "../error/parse_error_type";
import { binops_json } from "../syntax/json_types/binops_json";
import { i_token_iterator } from "../tokenize/i_token_iterator";
import { token_type } from "../tokenize/token_type";

export class expr_parser {
    parse(it: i_token_iterator): expr {
        const peek_tok = it.peek();
        if (peek_tok?.type === token_type.ob && peek_tok?.value === it.syntax_context.brackets.square.open) {
            it.next();
            const ids = this._parse_comma_list_idents(it);
            const e = this.parse(it);
            return { type: 'lam', value: [ids, e] };
        }
        return this.parse_binop(it, it.syntax_context.binops.json);
    }

    parse_binop(it: i_token_iterator, binop: binops_json): expr {
        const l = binop.l;
        let sub_parser = l
            ? (it: i_token_iterator) => this.parse_binop(it, l)
            : (it: i_token_iterator) => this.parse_suffixed(it);

        let expr = sub_parser(it);

        while (binop.ops.includes(it.peek()?.value ?? '')) {
            const binop = it.next();
            const expr_next = sub_parser(it);
            expr = { type: 'app', value: [{ type: 'access', value: [expr, binop.value ?? ''] }, [expr_next]] }
        }

        return expr;
    }

    parse_suffixed(it: i_token_iterator): expr {
        let expr = this.parse_atom(it);
        whil: while (true) {
            const peek_tok = it.peek();
            switch (peek_tok?.type) {
                case token_type.dot:
                    it.next();
                    const id_tok = it.next();
                    if (id_tok.type !== token_type.id)
                        throw new parse_error(parse_error_type.unexpected_token_expr, id_tok);
                    expr = { type: 'access', value: [expr, id_tok.value ?? ''] };
                    break;
                case token_type.ob:
                    if (peek_tok.value === it.syntax_context.brackets.square.open) {
                        it.next();
                        const es = this._parse_comma_list(it);
                        expr = { type: 'app', value: [expr, es] };
                    }
                    break;
                default:
                    break whil;
            }
        }
        return expr;
    }

    parse_atom(it: i_token_iterator): expr {
        while (!it.is_done()) {
            const tok = it.next();
            switch (tok.type) {
                case token_type.id:
                    return { type: 'var', value: tok.value ?? '' };
                case token_type.number:
                    return { type: 'number', value: Number(tok.value) };
                case token_type.string:
                    return { type: 'string', value: tok.value ?? '' };
                case token_type.ob:
                    if (tok.value == it.syntax_context.brackets.round.open) {
                        const t = this.parse(it);
                        it.next();
                        return t;
                    }
                default:
                    throw new parse_error(parse_error_type.unexpected_token_expr, tok);
            }
        }
        throw new parse_error(parse_error_type.unexpected_token_expr);
    }

    private _parse_comma_list(it: i_token_iterator): expr[] {
        const es: expr[] = [];
        while (true) {
            es.push(this.parse(it));
            const nextTok = it.next();

            if (nextTok.value === it.syntax_context.brackets.square.close) {
                return es;
            }
            if (nextTok.type !== token_type.comma) {
                throw new parse_error(parse_error_type.unexpected_token_expr, ['comma', nextTok]);
            }
        }
    }

    private _parse_comma_list_idents(it: i_token_iterator): string[] {
        const es: string[] = [];
        while (true) {
            const nextTok = it.next();
            if (nextTok.type === token_type.id) {
                es.push(nextTok.value ?? '');
                continue;
            }
            if (nextTok.value === it.syntax_context.brackets.square.close) {
                return es;
            }
            if (nextTok.type !== token_type.comma) {
                throw new parse_error(parse_error_type.unexpected_token_expr, ['comma', nextTok]);
            }
        }
    }
}