export type type =
    {type: 'var', value: string} |
    {type: 'file', value: string} |
    {type: 'fun', value: [type[], type]} |
    {type: 'app', value: [type, type[]]}
