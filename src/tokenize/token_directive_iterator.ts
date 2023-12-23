import { syntax_context } from "../syntax/syntax_context";
import { i_token_iterator } from "./i_token_iterator";
import { token } from "./token";
import { token_type } from "./token_type";

export class token_directive_iterator implements i_token_iterator {
    tab = 0;
    done = false;
    readonly syntax_context: syntax_context;
    constructor(readonly token_it: i_token_iterator) {
        this.syntax_context = token_it.syntax_context;
    }

    *tokens(): Iterable<token> {
        while (!this.is_done())
            yield this.next();
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

    is_done(): boolean {
        return this.token_it.is_done() || this.done;
    }

    peek(): token | undefined {
        const token = this.token_it.peek();
        if(token?.type === token_type.cr && this.tab === 0) {
            return { type: token_type.eod, pos: token.pos };
        }
        return token;
    }

    next(): token {
        const token = this.token_it.next();
        switch (token.type) {
            case token_type.tab:
                ++this.tab;
                break;
            case token_type.untab:
                --this.tab;
                break;
            case token_type.cr:
            case token_type.eod:
                if (this.tab === 0) {
                    this.done = true;
                    return { type: token_type.eod, pos: token.pos };
                }
        }
        return token;
    }
}
