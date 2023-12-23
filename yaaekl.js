'use strict';

var fs = require('fs');

class parse_error extends Error {
    constructor(type, payload) {
        super(`${type} ${JSON.stringify(payload, undefined, 2)}`);
    }
}

var parse_error_type;
(function (parse_error_type) {
    parse_error_type["unclosed_bracket"] = "unclosed_bracket";
    parse_error_type["next_called_after_done"] = "next_called_after_done";
    parse_error_type["unrecognized_char"] = "unrecognized_char";
    parse_error_type["empty_dir"] = "empty_dir";
    parse_error_type["unexpected_token_generics"] = "unexpected_token_generics";
    parse_error_type["unexpected_token_imports"] = "unexpected_token_imports";
    parse_error_type["unexpected_token_interfaces"] = "unexpected_token_interfaces";
    parse_error_type["unfinished_type"] = "unfinished_type";
    parse_error_type["unexpected_token_type"] = "unexpected_token_type";
    parse_error_type["unexpected_token_expr"] = "unexpected_token_expr";
})(parse_error_type || (parse_error_type = {}));

var token_type;
(function (token_type) {
    token_type["id"] = "id";
    token_type["var"] = "var";
    token_type["tab"] = "tab";
    token_type["untab"] = "untab";
    token_type["cr"] = "cr";
    token_type["string"] = "string";
    token_type["number"] = "number";
    token_type["ob"] = "ob";
    token_type["cb"] = "cb";
    token_type["binop"] = "binop";
    token_type["comma"] = "comma";
    token_type["dot"] = "dot";
    token_type["eod"] = "eod";
})(token_type || (token_type = {}));

class file_parser {
    constructor(type_parser) {
        this.type_parser = type_parser;
        this.members = [];
    }
    parse(it) {
        while (!it.is_done()) {
            it.directives([it.syntax_context.keywords.generics, (_, it) => this.generics = this._parse_generics(it)], [it.syntax_context.keywords.imports, (_, it) => this._parse_imports(it)], [it.syntax_context.keywords.interfaces, (_, it) => this._parse_interfaces(it)], [token_type.id, (herald, it) => this._parse_member(herald, it)]);
        }
    }
    _parse_generics(it) {
        var _a;
        const result = [];
        for (const tok of it.tokens()) {
            switch (tok.type) {
                case token_type.var:
                    result.push((_a = tok.value, (_a !== null && _a !== void 0 ? _a : '')));
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
    _parse_imports(it) {
        var _a;
        const result = [];
        while (!it.is_done()) {
            const tok = it.next();
            switch (tok.type) {
                case token_type.id:
                    result.push((_a = tok.value, (_a !== null && _a !== void 0 ? _a : '')));
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
    _parse_interfaces(it) {
        var _a, _b, _c;
        const result = [];
        while (true) {
            const peekTok = it.peek();
            if (it.is_done())
                break;
            if (((_a = peekTok) === null || _a === void 0 ? void 0 : _a.type) === token_type.eod ||
                ((_b = peekTok) === null || _b === void 0 ? void 0 : _b.type) === token_type.tab ||
                ((_c = peekTok) === null || _c === void 0 ? void 0 : _c.type) === token_type.untab) {
                it.next();
                continue;
            }
            result.push(this.type_parser.parse(it));
        }
        console.log('interfaces', JSON.stringify(result, undefined, 2));
        this.imports = result;
    }
    _parse_member(herald, it) {
        let type = undefined;
        it.directives([it.syntax_context.keywords.generics, (_, it) => {
                this._parse_generics(it);
            }], [it.syntax_context.keywords.type, (_, it) => {
                type = this.type_parser.parse(it);
                console.log('type', JSON.stringify(type));
            }]);
    }
}

class type_parser {
    // (a -> b) -> c
    // [[A] B] C
    //
    // a -> (b -> c)
    // [A] [B] C
    //
    parse(it) {
        var _a, _b;
        while (!it.is_done()) {
            const tok = it.next();
            switch (tok.type) {
                case token_type.var:
                    return this._parse_suffix({ type: 'var', value: (_a = tok.value, (_a !== null && _a !== void 0 ? _a : '')) }, it);
                case token_type.id:
                    return this._parse_suffix({ type: 'file', value: (_b = tok.value, (_b !== null && _b !== void 0 ? _b : '')) }, it);
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
    _parse_comma_list(it) {
        const ts = [];
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
    _parse_suffix(t, it) {
        var _a;
        const peekTok = it.peek();
        if (((_a = peekTok) === null || _a === void 0 ? void 0 : _a.value) === it.syntax_context.brackets.square.open) {
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

class binops {
    constructor(json) {
        this.json = json;
        this.binops = this._getBinopList(this.json);
    }
    _getBinopList(json) {
        if (json == null)
            return [];
        const binops = json.ops.split(' ');
        return [
            ...binops,
            ...this._getBinopList(json.l),
            ...this._getBinopList(json.r),
            ...this._getBinopList(json.lr)
        ];
    }
}

class brackets {
    constructor(json) {
        this.json = json;
        this.round = this._parse(json.round);
        this.square = this._parse(json.square);
        this.squiggly = this._parse(json.squiggly);
        this.brackets = [this.round, this.square, this.squiggly];
    }
    is_bracket(string) {
        return this.brackets.some(x => x.close === string || x.open === string);
    }
    get_matching_open_bracket(closingBracket) {
        var _a;
        return (_a = this.brackets.find(x => x.close === closingBracket)) === null || _a === void 0 ? void 0 : _a.open;
    }
    get_matching_close_bracket(openingBracket) {
        var _a;
        return (_a = this.brackets.find(x => x.open === openingBracket)) === null || _a === void 0 ? void 0 : _a.close;
    }
    _parse(bracket) {
        const parts = bracket.split(' ');
        return {
            open: parts[0],
            close: parts[1]
        };
    }
}

class keywords {
    constructor(json) {
        this.json = json;
        this.imports = this.json.imports;
        this.generics = this.json.generics;
        this.interfaces = this.json.interfaces;
        this.type = this.json.type;
        this.keywords = [
            this.imports,
            this.generics,
            this.interfaces,
            this.type
        ];
    }
    isKeyword(string) {
        return this.keywords.includes(string);
    }
}

class syntax_context {
    constructor(json) {
        this.json = json;
        this.keywords = new keywords(this.json.keywords);
        this.brackets = new brackets(this.json.brackets);
        this.binops = new binops(this.json.binops);
    }
}

class token_directive_iterator {
    constructor(token_it) {
        this.token_it = token_it;
        this.tab = 0;
        this.done = false;
        this.syntax_context = token_it.syntax_context;
    }
    *tokens() {
        while (!this.is_done())
            yield this.next();
    }
    directives(...fs) {
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
    next_directive() {
        return new token_directive_iterator(this);
    }
    is_done() {
        return this.token_it.is_done() || this.done;
    }
    peek() {
        var _a;
        const token = this.token_it.peek();
        if (((_a = token) === null || _a === void 0 ? void 0 : _a.type) === token_type.cr && this.tab === 0) {
            return { type: token_type.eod, pos: token.pos };
        }
        return token;
    }
    next() {
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

class token_src_iterator {
    constructor(syntax_context, src) {
        this.syntax_context = syntax_context;
        this.src = src;
        this.i = 0;
        this.end = this.src.length;
        this.done = false;
        this.token_stack = [];
        this.indent_stack = [];
        this.bracket_stack = [];
        this.id_regexp = /^[a-zæøå][a-z_æøå]*/;
        this.ID_regexp = /^[A-ZÆØÅ][A-Z_ÆØÅ]*/;
        this.string_regexp = /^"(\\.|[^"\\])*"/;
        this.number_regexp = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
        this.matchers = [
            { id: token_type.id, regexp: this.id_regexp },
            { id: token_type.var, regexp: this.ID_regexp },
            { id: token_type.string, regexp: this.string_regexp },
            { id: token_type.number, regexp: this.number_regexp },
        ];
    }
    *tokens() {
        while (!this.is_done())
            yield this.next();
    }
    is_done() {
        return this.done;
    }
    peek() {
        if (this.is_done()) {
            return undefined;
        }
        const token = this.next();
        this.token_stack.push(token);
        return token;
    }
    directives(...fs) {
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
    next_directive() {
        return new token_directive_iterator(this);
    }
    next() {
        var _a, _b, _c, _d;
        const { syntax_context, src, i, end, matchers, indent_stack, bracket_stack, token_stack } = this;
        if (token_stack.length > 0)
            return token_stack.pop();
        if (i >= end) {
            if (bracket_stack.length > 0) {
                throw new parse_error(parse_error_type.unclosed_bracket, bracket_stack.pop());
            }
            if (indent_stack.length === 0) {
                if (this.done)
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
            const match = (_a = m.regexp.exec(substring)) === null || _a === void 0 ? void 0 : _a[0];
            if (match != null && match.length > 0) {
                this.i += match.length;
                if (syntax_context.keywords.keywords.includes(match)) {
                    return { type: match, pos: pos };
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
            const match = (_b = /\n */.exec(substring)) === null || _b === void 0 ? void 0 : _b[0];
            let top = (_c = indent_stack[indent_stack.length - 1], (_c !== null && _c !== void 0 ? _c : 0));
            const spaces = (_d = match.length - 1, (_d !== null && _d !== void 0 ? _d : 0));
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

const syntax_json = JSON.parse(fs.readFileSync('./syntax.json').toString());
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
