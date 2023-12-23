import { binops } from "./binops";
import { brackets } from "./brackets";
import { syntax_json } from "./json_types/syntax_json";
import { keywords } from "./keywords";

export class syntax_context {
    constructor(readonly json: syntax_json) {}

    readonly keywords = new keywords(this.json.keywords);
    readonly brackets = new brackets(this.json.brackets);
    readonly binops = new binops(this.json.binops);
}
