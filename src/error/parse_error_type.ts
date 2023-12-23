export enum parse_error_type {
    unclosed_bracket = 'unclosed_bracket',
    next_called_after_done = 'next_called_after_done',
    unrecognized_char = 'unrecognized_char',
    empty_dir = 'empty_dir',
    unexpected_token_generics = 'unexpected_token_generics',
    unexpected_token_imports = 'unexpected_token_imports',
    unexpected_token_interfaces = 'unexpected_token_interfaces',
    unfinished_type = 'unfinished_type',
    unexpected_token_type = 'unexpected_token_type',
    unexpected_token_expr = 'unexpected_token_expr'
}
