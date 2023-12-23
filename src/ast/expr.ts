export type expr =
    {type: 'var', value: string} |
    {type: 'lam', value: [string[], expr]} |
    {type: 'app', value: [expr, expr[]]} |
    {type: 'number', value: number} |
    {type: 'string', value: string} |
    {type: 'access', value: [expr, string]}
