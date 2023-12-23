import { brackets_json } from "./json_types/brackets_json";

export class brackets {
    constructor(readonly json: brackets_json) {
        this.round = this._parse(json.round);
        this.square = this._parse(json.square);
        this.squiggly = this._parse(json.squiggly);
        this.brackets = [this.round, this.square, this.squiggly];
    }
    
    readonly round: { readonly open: string, readonly close: string };
    readonly square: { readonly open: string, readonly close: string };
    readonly squiggly: { readonly open: string, readonly close: string };
    readonly brackets: { readonly open: string, readonly close: string }[];

    is_bracket(string: string): boolean {
        return this.brackets.some(x => x.close === string || x.open === string);
    }

    get_matching_open_bracket(closingBracket: string): string | undefined {
        return this.brackets.find(x => x.close === closingBracket)?.open;
    }

    get_matching_close_bracket(openingBracket: string): string | undefined {
        return this.brackets.find(x => x.open === openingBracket)?.close;
    }

    private _parse(bracket: string) {
        const parts = bracket.split(' ');
        return {
            open: parts[0],
            close: parts[1]
        };
    }
}
