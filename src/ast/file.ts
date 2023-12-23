import { stmt } from "./stmt";
import { type } from "./type";

export interface file {
    imports: string[];
    generics: string[];
    interfaces: file[];
    types: Record<string, [string[], type]>
    defs: Record<string, stmt[]>
}