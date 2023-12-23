import { syntax_context } from "../syntax/syntax_context";
import { token } from "./token";
import { token_type } from "./token_type";

export interface i_token_iterator {
    tokens(): Iterable<token>;
    is_done(): boolean;
    peek(): token | undefined;
    directives(...fs: [token_type, (herald: token, it: i_token_iterator) => void][]): void;
    next_directive(): i_token_iterator;
    next(): token;
    syntax_context: syntax_context;
}
