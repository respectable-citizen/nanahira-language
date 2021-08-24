const Tokens = require("./tokens");

class Lexer {
    
    constructor(code) {
        this.code = code;
        this.tokens = [];
        this.start = 0;
        this.pos = 0;
        this.line = 1;
    }

    addToken(token) {
        token.line = this.line;
        token.start = this.start;
        token.end = this.pos;
        this.tokens.push(token);
    }

    atEnd() {
        return this.pos >= this.code.length;
    }

    isWhitespace(char) {
        return (["\r", "\n", "\t", " "]).includes(char);
    }

    isAlpha(char) {
        let charCode = char.toLowerCase().charCodeAt(0);

        return charCode >= "a".charCodeAt(0) && charCode <= "z".charCodeAt(0);
    }
    
    isDigit(char) {
        let charCode = char.toLowerCase().charCodeAt(0);

        return charCode >= "0".charCodeAt(0) && charCode <= "9".charCodeAt(0);
    }

    isAlphanumeric(char) {
        return this.isAlpha(char) || this.isDigit(char);
    }

    peek() {
        if (this.atEnd()) return "\0"; //We are at the end of the file, it actually doesn't matter what we return here as long as nothing in the lexer matches it
        return this.code[this.pos];
    }
    
    peekNext() {
        return this.code[this.pos + 1];
    }

    advance() {
        this.pos++;
    }

    match(chars) {
        if (typeof chars == "string") chars = [chars]; //If the function is only called with one letter, turn it into an array because that's how we expect it to be formatted

        if (chars.includes(this.code[this.pos])) {
            this.advance();
            return true;
        }
        return false;
    }

    get() {
        let char = this.peek();
        this.advance();
        return char;
    }

    run() {
        while (!this.atEnd()) {
            //Skip whitespace
            while (this.isWhitespace(this.peek())) {
                if (this.peek() == "\n") this.line++;
                this.advance();
            }
            if (this.atEnd()) break;

            //Determine token type
            this.start = this.pos;
            if (this.isDigit(this.peek())) {
                //Number token
                //TODO: Decimals
                let number = "";

                while (this.isDigit(this.peek())) {
                    number += this.get();
                }

                number = parseInt(number);

                this.addToken({
                    type: Tokens.INTEGER_LITERAL,
                    value: number
                });
            } else if (this.peek() == ";") {
                this.advance();

                this.addToken({
                    type: Tokens.END_OF_LINE
                });
            } else if (this.peek() == "(") {
                this.advance();
                this.addToken({
                    type: Tokens.LEFT_PAREN
                });
            } else if (this.peek() == ")") {
                this.advance();
                this.addToken({
                    type: Tokens.RIGHT_PAREN
                });
            } else if (this.peek() == "{") {
                this.advance();
                this.addToken({
                    type: Tokens.LEFT_CURLY_BRACE
                });
            } else if (this.peek() == "}") {
                this.advance();
                this.addToken({
                    type: Tokens.RIGHT_CURLY_BRACE
                });
            }
            //Start of operator handling
            //Operators handled here: +, -, *, /, !, =, == , !=, >, <, >=, <=, |, ||, &, &&
            else if (this.peek() == "+") {
                this.advance();
                this.addToken({
                    type: Tokens.OPERATOR_ADD
                });
            } else if (this.peek() == "-") {
                this.advance();
                this.addToken({
                    type: Tokens.OPERATOR_SUBTRACT
                });
            } else if (this.peek() == "*") {
                this.advance();
                this.addToken({
                    type: Tokens.OPERATOR_MULTIPLY
                });
            } else if (this.peek() == "/") {
                this.advance();
                this.addToken({
                    type: Tokens.OPERATOR_DIVIDE
                });
            } else if (this.peek() == "!") {
                this.advance();
                if (this.peekNext() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.OPERATOR_NOT_EQUALITY
                    });
                } else {
                    this.addToken({
                        type: Tokens.OPERATOR_NEGATE
                    });
                }
            } else if (this.peek() == "=") {
                this.advance();
                if (this.peekNext() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.OPERATOR_EQUALITY
                    });

                } else {
                    this.addToken({
                        type: Tokens.OPERATOR_ASSIGN
                    });
                }
            } else if (this.peek() == ">") {
                this.advance();
                if (this.peekNext() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.OPERATOR_GREATER_THAN_OR_EQUAL
                    });
                } else {
                    this.addToken({
                        type: Tokens.OPERATOR_GREATER_THAN
                    });
                }
            } else if (this.peek() == "<") {
                this.advance();
                if (this.peekNext() == "<") {
                    this.advance();
                    this.addToken({
                        type: Tokens.OPERATOR_LESS_THAN_OR_EQUAL
                    });

                } else {
                    this.addToken({
                        type: Tokens.OPERATOR_LESS_THAN
                    });
                }
            } else if (this.peek() == "|") {
                this.advance();
                if (this.peekNext() == "|") {
                    this.advance();
                    this.addToken({
                        type: Tokens.OPERATOR_LOGICAL_OR
                    });

                } else {
                    this.addToken({
                        type: Tokens.OPERATOR_BINARY_OR
                    });
                }
            } else if (this.peek() == "&") {
                this.advance();
                if (this.peekNext() == "&") {
                    this.advance();
                    this.addToken({
                        type: Tokens.OPERATOR_LOGICAL_AND
                    });

                } else {
                    this.addToken({
                        type: Tokens.OPERATOR_BINARY_AND
                    });
                }
            } else {
                if (this.isAlpha(this.peek())) {
                    let identifier = this.get();
                    
                    while (this.isAlphanumeric(this.peek())) {
                        identifier += this.get();
                    }

                    this.addToken({
                        type: Tokens.IDENTIFIER,
                        value: identifier
                    });
                } else {
                    console.error(`Unexpected character "${this.peek()}" at position ${this.pos}`);
                    this.advance();
                }

            }
        }

        this.addToken({
            type: Tokens.END_OF_FILE
        });
    }
}

module.exports = Lexer;