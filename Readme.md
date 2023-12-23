# Yaækl - Yet Another ÆbleKage Language 🍏🥧

# Install

```
$ npm install yaaekl
```

# Example
```
either.æ
----
generics LEFT RIGHT
case
    generics C
    type [LEFT > C, RIGHT > C] > C
----

left.æ:
----
generics LEFT RIGHT
interfaces either[LEFT, RIGHT]

value
    type LEFT
case
    [f, _]> f[value]
----

list.æ:
----
imports 
    number
generics
    A
interfaces
    monad[list, A]

length
    type number
append
    type list[A] > list[A]
----

foo.æ:
----
main
    f = [x]>
        x = bim baum
        baz
    foo = bar
    baz = foo
    x = baz
    x
----
```

# YAAEKL grammar
Whitespace sensitivity:
```
A* ::= A SPACE ... SPACE A 
    | INDENT A NEWLINE ... NEWLINE A DEDENT
```

```
KEYWORDS ::= imports | generics | interfaces 
    | type
NUMBER ::= ...
STRING ::= '...'
BINOP ::= + | - | * | / | == | <= | != | ...
iDENT ::= a..å_ (except KEYWORDS)
IDENT ::= A..Å_

PATH ::= iDENT | iDENT.PATH

FILE ::= FILE_ELT*
FILE_ELT ::= imports PATH*
    | generics IDENT*
    | interfaces INTERFACE*
    | iDENT MEMBER_ELT*

INTERFACE ::= iDENT ([TYPE, ..., TYPE])?  

MEMBER_ELT ::= generics IDENT*
    | type TYPE
    | STMT

TYPE ::= IDENT | iDENT 
    | [TYPE, ..., TYPE] TYPE
    | TYPE [TYPE, ..., TYPE]

STMT ::= EXPR | iDENT = STMT*

EXPR ::= iDENT 
    | [iDENT,...,iDENT] EXPR
    | EXPR [EXPR, ..., EXPR]
    | NUMBER | STRING
    | EXPR BINOP EXPR | EXPR.iDENT
```