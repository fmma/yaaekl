import { expr } from "./expr";

export type stmt =
    {type: 'expr', value: expr} |
    {type: 'assign', value: [string, stmt[]]}
