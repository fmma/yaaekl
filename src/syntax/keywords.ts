import { token_type } from "../tokenize/token_type";
import { keywords_json as keywords_json } from "./json_types/keywords_json";

export class keywords implements keywords_json {
    constructor(readonly json: keywords_json) { }

    readonly imports = this.json.imports as token_type;
    readonly generics = this.json.generics as token_type;
    readonly interfaces = this.json.interfaces as token_type;
    readonly type = this.json.type as token_type;
    readonly keywords = [
        this.imports as string, 
        this.generics as string, 
        this.interfaces as string, 
        this.type as string];

    isKeyword(string: string): boolean {
        return this.keywords.includes(string);
    }
}
