import { parse_error_type } from "./parse_error_type";

export class parse_error extends Error {
    constructor(type: parse_error_type, payload?: any) {
        super(`${type} ${JSON.stringify(payload, undefined, 2)}`);
    }
}
