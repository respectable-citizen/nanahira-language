const Tokens = require("../lexer/tokens");
const Nodes = require("./nodes");

/*
Parser grammar:

program := importStatement* declaration*

declaration := functionDeclaration | variableDeclaration

parameters := IDENTIFIER IDENTIFIER ("," IDENTIFIER IDENTIFIER)*
arguments = expression ("," expression)*

block := "{" (variableDeclaration | statement)* "}"

//Base expression
expression := equality ";"
equality := comparison (("!=" | "==") comparison)*
comparison := term ((">" | ">=" | "<" | "<=") term )*
term := factor (( "-" | "+" ) factor)*
factor := unary (( "/" | "*" | "%" ) unary)*
unary := (( "!" | "-" ) unary) | primary
primary := NUMBER | array | "(" expression ")" | IDENTIFIER[ arrayIndex ] | callExpression

array = "{" [ NUMBER ("," NUMBER) ] "}"
arrayIndex = "[" expression "]"

//Expressions
assignmentExpression := IDENTIFIER ( [ "[" [ expression ] "]" ] ["=" expression] ) | ("++" | "--")
callExpression := IDENTIFIER "(" [arguments] ")"

//Declarations
functionDeclaration := dataType IDENTIFIER "(" [parameters] ")" block
variableDeclaration := dataType assignmentExpression ";" //Same as assignmentExpression, but with a data type because the variable is being declared for the first time

dataType = IDENTIFIER [ "[" "]" ]

//Statements
statement := expressionStatement | returnStatement | ifStatement | whileStatement

expressionStatement := (assignmentExpression | callExpression) ";"
returnStatement := "return" [expression] ";"
ifStatement := "if" "(" expression ")" block
whileStatement = "while" "(" expression ")" block
forStatement = "for" "(" variableDeclaration expression ";" assignmentExpression ")" block
importStatement = "import" identifier ";"

*/

class Parser {
    constructor(code, error, tokens) {
        this.code = code;
		this.error = error;
        this.tokens = tokens;
        this.pos = 0;
    }

	parserError(message) {
		let lineTokens = this.getLineTokens(this.peek().line);
		let startLine = lineTokens[0].start;
		let endLine = lineTokens[lineTokens.length - 1].end;
		let line = this.code.substring(startLine, endLine);

		this.error.reportError(this.peek().line, line, message, this.peek().start - startLine);
		throw "TODO: Implement synchronization for errors (this will allow the compiler to keep parsing even after an error)";
	}

	unexpectedToken(expectedTokenType = null) {
		if (expectedTokenType) {
			this.parserError(`Expected ${expectedTokenType} but got ${this.peek().type}`);
		} else {
			this.parserError(`Unexpected token ${this.peek().type}`);
		}
	}

    getLineTokens(line) {
        return this.tokens.filter(token => token.line == line);
    }

    atEnd() {
        return this.peek().type == Tokens.END_OF_FILE;
    }

    advance() {
        this.pos++;
    }

    peekOffset(offset) {
        let item = this.tokens[this.pos + offset];
        if (item) return item;

        return {
            type: Tokens.END_OF_FILE //Yes, technically this would be returned even if the error was caused by accessing a negative index. However, I don't think that can ever happen so /shrug
        };
    }

    peek() {
        return this.peekOffset(0);
    }

    peekNext() {
        return this.peekOffset(1);
    }

    previous() {
        return this.peekOffset(-1);
    }

    match(tokenTypes) {
        if (typeof tokenTypes == "string") tokenTypes = [tokenTypes]; //If the function is only called with one token, turn it into an array because that's how we expect it to be formatted

        for (let tokenType of tokenTypes) {
            if (tokenType == this.peek().type) {
                this.advance();
                return true;
            }
        }

        return false;
    }

    expect(tokenType) {
        if (!this.match(tokenType)) this.unexpectedToken(tokenType);
        return this.previous();
    }

    get() {
        let token = this.peek();
        this.advance();
        return token;
    }

    run() {
        this.ast = this.parseProgram();
    }

    parseProgram() {
		this.imports = [];
		while (this.peek().type == Tokens.KEYWORD_IMPORT) this.imports.push(this.parseImportStatement());

        this.declarations = [];
        while (!this.atEnd()) this.declarations.push(this.parseDeclaration());

        return {
			imports: this.imports,
			declarations: this.declarations
		};
    }

    determineDeclarationType() {
        if (this.peek().type != Tokens.IDENTIFIER) return Nodes.NONE;
       
		//Skip pairs of array brackets
		let offset = 1;
    	if (this.peekOffset(offset).type == Tokens.LEFT_SQUARE_BRACE) {
			while (this.peekOffset(offset++).type != Tokens.RIGHT_SQUARE_BRACE);
		}
		
		if (this.peekOffset(offset).type != Tokens.IDENTIFIER) return Nodes.NONE;

		if (this.peekOffset(offset + 1).type == Tokens.LEFT_PAREN) return Nodes.FUNCTION_DECLARATION;
		return Nodes.VARIABLE_DECLARATION;
	}

	determineExpressionStatementType() {
		if (this.peek().type != Tokens.IDENTIFIER) return Nodes.NONE;
	
		if (this.peekNext().type == Tokens.LEFT_PAREN) return Nodes.CALL_EXPRESSION;
		
		return Nodes.ASSIGNMENT_EXPRESSION;
	}

    parseDeclaration() {
        let declarationType = this.determineDeclarationType();

        if (declarationType == Nodes.FUNCTION_DECLARATION) return this.parseFunctionDeclaration();
        if (declarationType == Nodes.VARIABLE_DECLARATION) return this.parseVariableDeclaration();
        
        this.unexpectedToken();
    }

    parseFunctionDeclaration() {
        let returnType = this.parseDataType();
        let identifier = this.expect(Tokens.IDENTIFIER);
        this.expect(Tokens.LEFT_PAREN);
        let parameters = [];
        if (this.peek().type != Tokens.RIGHT_PAREN) parameters = this.parseParameters();
        this.expect(Tokens.RIGHT_PAREN);
		
		let end = this.peek().end;
        let block = this.parseBlock();

        return {
            type: Nodes.FUNCTION_DECLARATION,
            returnType,
            identifier,
            parameters,
            block,
			start: returnType.start,
			end,
			line: returnType.line
        };
    }

    parseVariableDeclaration() {
        let dataType = this.parseDataType();
        let assignment = this.parseAssignmentExpression();
        assignment.type = Nodes.VARIABLE_DECLARATION;
        assignment.dataType = dataType;
		assignment.start = dataType.identifier.start;
		assignment.end = this.peek().end;
		assignment.line = this.peek().line;
        
		this.expect(Tokens.END_OF_LINE);
        
		return assignment;
    }

	parseDataType() {
		let identifier = this.expect(Tokens.IDENTIFIER);
		let isArray = false;
		let arraySize;
		if (this.match(Tokens.LEFT_SQUARE_BRACE)) {
			isArray = true;
			if (this.match(Tokens.INTEGER_LITERAL))	arraySize = this.previous();
			this.expect(Tokens.RIGHT_SQUARE_BRACE);
		}

		return {
			type: Nodes.DATA_TYPE,
			identifier,
			isArray,
			arraySize
		};
	}

    parseStatement() {
		let start = this.peek().start;
		let line = this.peek().line;
		
		let statement;
        if (this.peek().type == Tokens.KEYWORD_RETURN) statement = this.parseReturnStatement();
		else if (this.peek().type == Tokens.KEYWORD_IF) statement = this.parseIfStatement();
		else if (this.peek().type == Tokens.KEYWORD_WHILE) statement = this.parseWhileStatement();
		else if (this.peek().type == Tokens.KEYWORD_FOR) statement = this.parseForStatement();
		else if (this.peek().type == Tokens.IDENTIFIER) statement = this.parseExpressionStatement();
		if (!statement) this.unexpectedToken();
		
		let end = this.previous().end;
	
		if (!statement.start) statement.start = start;
		if (!statement.end) statement.end = end;
		if (!statement.line) statement.line = line;

		return statement;
    }

    parseExpressionStatement() {
		let startToken = this.peek();

		let expressionStatementType = this.determineExpressionStatementType();
		let expression;

		if (expressionStatementType == Nodes.CALL_EXPRESSION) expression = this.parseCallExpression();
		if (expressionStatementType == Nodes.ASSIGNMENT_EXPRESSION) expression = this.parseAssignmentExpression();
		if (!expression) this.unexpectedToken();
    	
		this.expect(Tokens.END_OF_LINE);

		return {
			type: Nodes.EXPRESSION_STATEMENT,
			expression,
			start: startToken.start,
			end: this.previous().end,
			line: startToken.line
		};
	}

    parseReturnStatement() {
		let start = this.peek().start;
        
		this.expect(Tokens.KEYWORD_RETURN);
        let expression;
		if (this.peek().type != Tokens.END_OF_LINE) expression = this.parseExpression();
        this.expect(Tokens.END_OF_LINE);

        return {
            type: Nodes.RETURN_STATEMENT,
            expression,
			start,
			end: this.previous().end,
			line: this.previous().line
        };
    }

	parseIfStatement() {
		this.expect(Tokens.KEYWORD_IF);
		this.expect(Tokens.LEFT_PAREN);

		let expression = this.parseExpression();

		this.expect(Tokens.RIGHT_PAREN);
	
		let block = this.parseBlock();

		return {
			type: Nodes.IF_STATEMENT,
			expression,
			block
		};
	}
	
	parseWhileStatement() {
		this.expect(Tokens.KEYWORD_WHILE);
		this.expect(Tokens.LEFT_PAREN);

		let expression = this.parseExpression();

		this.expect(Tokens.RIGHT_PAREN);

		let block = this.parseBlock();

		return {
			type: Nodes.WHILE_STATEMENT,
			expression,
			block
		};
	}

	parseForStatement() {
		let start = this.peek().start;

		this.expect(Tokens.KEYWORD_FOR);
		
		this.expect(Tokens.LEFT_PAREN);
		let declarator = this.parseVariableDeclaration();
		let condition = this.parseExpression();
		this.expect(Tokens.END_OF_LINE);
		let iterator = this.parseAssignmentExpression();
		this.expect(Tokens.RIGHT_PAREN);

		let end = this.previous().end;

		let block = this.parseBlock();

		return {
			type: Nodes.FOR_STATEMENT,
			declarator,
			condition,
			iterator,
			block,
			start,
			end
		};
	}

	parseImportStatement() {
		this.expect(Tokens.KEYWORD_IMPORT);

		let identifier = this.expect(Tokens.IDENTIFIER);

		this.expect(Tokens.END_OF_LINE);

		return {
			type: Nodes.IMPORT_STATEMENT,
			identifier
		};
	}

    parseBlock() {
        this.expect(Tokens.LEFT_CURLY_BRACE);
        
        let lines = [];
        while (this.peek().type != Tokens.RIGHT_CURLY_BRACE) {
            //Parse variable declaration
            let declarationType = this.determineDeclarationType();
			
			if (declarationType == Nodes.VARIABLE_DECLARATION) {
                lines.push(this.parseVariableDeclaration());
            } else {
                //Parse statement
                lines.push(this.parseStatement());
            }
        }
        
        this.expect(Tokens.RIGHT_CURLY_BRACE);
        return lines;
    }

    parseParameters() {
        let parameters = [];
        let expectComma = false;

        while (this.peek().type != Tokens.RIGHT_PAREN) {
            if (expectComma) {
                this.expect(Tokens.COMMA);
            } else {
                expectComma = true;
            }

            let dataType = this.parseDataType();
            let identifier = this.expect(Tokens.IDENTIFIER);

            parameters.push({
                type: Nodes.PARAMETER,
                dataType,
                identifier
            });
        }

        return parameters;
    }

    parseAssignmentExpression() {
        let identifier = this.expect(Tokens.IDENTIFIER);
        let operator;
		let array = false;
		let index;
		let bracketStart;
		let expression;

		if (this.peek().type == Tokens.PLUS_PLUS || this.peek().type == Tokens.MINUS_MINUS) {
			operator = {
				type: this.get().type.split("_")[0] + "_EQUAL"
			};

			expression = {
				type: Nodes.INTEGER_LITERAL,
				value: {value: 1}
			};
		} else {
			//Array
			if (this.match(Tokens.LEFT_SQUARE_BRACE)) {
				bracketStart = this.previous().start; //Used for showing error when array size is missing

				array = true;
				index = this.parseExpression();

				this.expect(Tokens.RIGHT_SQUARE_BRACE);
			}
        
        	if (this.match([Tokens.EQUAL, Tokens.PLUS_EQUAL, Tokens.MINUS_EQUAL, Tokens.STAR_EQUAL, Tokens.SLASH_EQUAL])) {
            	operator = this.previous();
            	expression = this.parseExpression();
        	}
		}

        return {
            type: Nodes.ASSIGNMENT_EXPRESSION,
            identifier,
            operator,
            expression,
			array,
			index,
			bracketStart
        };
    }

    parseCallExpression() {
        let identifier = this.expect(Tokens.IDENTIFIER);
        
        this.expect(Tokens.LEFT_PAREN);
        
        let args = [];
        if (this.peek().type != Tokens.RIGHT_PAREN) args = this.parseArguments();
        
        this.expect(Tokens.RIGHT_PAREN);

        return {
            type: Nodes.CALL_EXPRESSION,
            identifier,
            args
        };
    }

    parseArguments() {
        let args = [this.parseExpression()];

        while (this.peek().type != Tokens.RIGHT_PAREN) {
            this.expect(Tokens.COMMA);
            args.push(this.parseExpression());
        }

        return args;
    }

    parseExpression() {
        return this.parseEquality();
    }

    parseEquality() {
        let expression = this.parseComparison();

        while (this.match([Tokens.EQUAL, Tokens.BANG_EQUAL])) {
            let operator = this.previous();
            let right = this.parseComparison();

            expression = {
                type: Nodes.BINARY_EXPRESSION,
                operator: operator.type,
                left: expression,
                right
            };
        }

        return expression;
    }

    parseComparison() {
        let expression = this.parseTerm();

        while (this.match([Tokens.GREATER_EQUAL, Tokens.LESS_EQUAL, Tokens.GREATER, Tokens.LESS])) {
            let operator = this.previous();
            let right = this.parseTerm();

            expression = {
                type: Nodes.BINARY_EXPRESSION,
                operator: operator.type,
                left: expression,
                right
            };
        }

        return expression;
    }
    
    parseTerm() {
        let expression = this.parseFactor();

        while (this.match([Tokens.PLUS, Tokens.MINUS])) {
            let operator = this.previous();
            let right = this.parseFactor();

            expression = {
                type: Nodes.BINARY_EXPRESSION,
                operator: operator.type,
                left: expression,
                right
            };
        }

        return expression;
    }

    parseFactor() {
        let expression = this.parseUnary();

        while (this.match([Tokens.STAR, Tokens.SLASH, Tokens.PERCENT])) {
            let operator = this.previous();
            let right = this.parseUnary();

            expression = {
                type: Nodes.BINARY_EXPRESSION,
                operator: operator.type,
                left: expression,
                right
            };
        }

        return expression;
    }

    parseUnary() {
        if (this.match([Tokens.MINUS, Tokens.BANG])) {
            let operator = this.previous();
            let expression = this.parseUnary();

            return {
                type: Nodes.UNARY_EXPRESSION,
                operator: operator.type,
                expression
            };
        }

        return this.parsePrimary();
    }

    parsePrimary() {
        if (this.match(Tokens.INTEGER_LITERAL)) return {
            type: Nodes.INTEGER_LITERAL,
            value: this.previous()
        };

		if (this.match(Tokens.STRING_LITERAL)) return {
            type: Nodes.STRING_LITERAL,
            value: this.previous()
        };

		if (this.match(Tokens.LEFT_CURLY_BRACE)) {
			let values = [];
			while (this.peek().type != Tokens.RIGHT_CURLY_BRACE) {
				let number = this.expect(Tokens.INTEGER_LITERAL);
				values.push(number);
				
				if (this.peek().type != Tokens.RIGHT_CURLY_BRACE) this.expect(Tokens.COMMA);
			}
			this.expect(Tokens.RIGHT_CURLY_BRACE);

			return {
				type: Nodes.ARRAY,
				values
			};
		}

        if (this.match(Tokens.LEFT_PAREN)) {
            let expression = this.parseExpression();
            this.expect(Tokens.RIGHT_PAREN);
            return expression;
        }
        
        if (this.peek().type == Tokens.IDENTIFIER) {
            if (this.peekNext().type == Tokens.LEFT_PAREN) {
                //Call expression
                return this.parseCallExpression();
            } else {
                //Variable
				let value = this.expect(Tokens.IDENTIFIER);

				//Check for array index
				let arrayIndex;
				if (this.match(Tokens.LEFT_SQUARE_BRACE)) {
					arrayIndex = this.parseExpression();
					this.expect(Tokens.RIGHT_SQUARE_BRACE);
				}

                return {
                    type: Nodes.VARIABLE,
                    value,
					arrayIndex
                };
            }
        }


        this.unexpectedToken();
    }
}

module.exports = Parser;
