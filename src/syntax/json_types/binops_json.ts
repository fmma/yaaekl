export interface binops_json {
    readonly ops: string,
    readonly l?: binops_json,
    readonly r?: binops_json,
    readonly lr?: binops_json
}