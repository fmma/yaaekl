import * as fs from 'fs';
import { file_parser } from "./parse/file_parser";
import { type_parser } from "./parse/type_parser";
import { syntax_json } from './syntax/json_types/syntax_json';
import { syntax_context } from "./syntax/syntax_context";
import { token_src_iterator } from "./tokenize/token_src_iterator";

const syntax_json: syntax_json = JSON.parse(fs.readFileSync('./syntax.json').toString());
const new_syntax_context = new syntax_context(syntax_json);

let src = [
    "imports examples.number.extras",
    "  examples.bool",
    "generics A B C",
    "generics",
    "  A",
    "  B",
    "  C",
    "generics A B",
    "  C",
    "interfaces functor[A] ([B][A]monad[A][B])",
    "interfaces functor[A]",
    "  [B][A]monad[A][B]",
    "map",
    "  generics B",
    "    HEJ",
    "med",
    "  type [A, B, F[A]] F[B]"
].join('\n');
const new_token_it = new token_src_iterator(new_syntax_context, src);
new file_parser(new type_parser()).parse(new_token_it);
