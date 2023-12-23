import { binops_json } from "./binops_json";
import { brackets_json } from "./brackets_json";
import { keywords_json } from "./keywords_json";

export interface syntax_json {
    readonly brackets: brackets_json,
    readonly keywords: keywords_json,
    readonly binops: binops_json
}