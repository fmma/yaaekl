import { binops_json } from "./json_types/binops_json";

export class binops {
    constructor(readonly json: binops_json) {}

    readonly binops = this._getBinopList(this.json);

    private _getBinopList(json?: binops_json): string[] {
        if (json == null)
            return [];
        const binops = json.ops.split(' ');
        return [
            ...binops,
            ...this._getBinopList(json.l),
            ...this._getBinopList(json.r),
            ...this._getBinopList(json.lr)
        ]
    }
}
