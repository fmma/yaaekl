import { token_type } from "./token_type";

export interface token {
    type: token_type;
    value?: string;
    pos: number;
}