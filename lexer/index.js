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
            } else if (this.peek() == '"') {
				this.advance();

				let value = "";
				while (this.peek() != '"') value += this.get();

				this.advance();

				this.addToken({
					type: Tokens.STRING_LITERAL,
					value
				});
			}

            //Start of operator handling
            //Operators handled here: +, -, *, /, !, =, == , !=, >, <, >=, <=, |, ||, &, &&
            else if (this.peek() == "+") {
                this.advance();
                if (this.peek() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.PLUS_EQUAL
                    });

                } else {
                    this.addToken({
                        type: Tokens.PLUS
                    });
                }
            } else if (this.peek() == "-") {
                this.advance();
                if (this.peek() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.MINUS_EQUAL
                    });

                } else {
                    this.addToken({
                        type: Tokens.MINUS
                    });
                }
            } else if (this.peek() == "*") {
                this.advance();
                if (this.peek() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.STAR_EQUAL
                    });

                } else {
                    this.addToken({
                        type: Tokens.STAR
                    });
                }
            } else if (this.peek() == "/") {
                this.advance();
                if (this.peek() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.SLASH_EQUAL
                    });

                } else {
                    this.addToken({
                        type: Tokens.SLASH
                    });
                }
            } else if (this.peek() == "!") {
                this.advance();
                if (this.peek() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.BANG_EQUAL
                    });
                } else {
                    this.addToken({
                        type: Tokens.BANG
                    });
                }
            } else if (this.peek() == "=") {
                this.advance();
                if (this.peek() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.EQUAL_EQUAL
                    });

                } else {
                    this.addToken({
                        type: Tokens.EQUAL
                    });
                }
            } else if (this.peek() == ">") {
                this.advance();
                if (this.peek() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.GREATER_EQUAL
                    });
                } else {
                    this.addToken({
                        type: Tokens.GREATER
                    });
                }
            } else if (this.peek() == "<") {
                this.advance();
                if (this.peek() == "=") {
                    this.advance();
                    this.addToken({
                        type: Tokens.LESS_EQUAL
                    });

                } else {
                    this.addToken({
                        type: Tokens.LESS
                    });
                }
            } else if (this.peek() == "|") {
                this.advance();
                if (this.peek() == "|") {
                    this.advance();
                    this.addToken({
                        type: Tokens.PIPE_PIPE
                    });

                } else {
                    this.addToken({
                        type: Tokens.PIPE
                    });
                }
            } else if (this.peek() == "&") {
                this.advance();
                if (this.peek() == "&") {
                    this.advance();
                    this.addToken({
                        type: Tokens.AND_AND
                    });

                } else {
                    this.addToken({
                        type: Tokens.AND
                    });
                }
            } else if (this.peek() == ",") {
                this.advance();
                this.addToken({
                    type: Tokens.COMMA
                });
            } else {
                if (this.isAlpha(this.peek())) {
                    let identifier = this.get();
                    
                    while (this.isAlphanumeric(this.peek())) {
                        identifier += this.get();
                    }

                    //If this matches any keywords insert a keyword, otherwise insert it as an identifier
                    if (identifier == "return") {
                         this.addToken({
                            type: Tokens.KEYWORD_RETURN
                        });
                    } else {
                        this.addToken({
                            type: Tokens.IDENTIFIER,
                            value: identifier
                        });
                    }
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
