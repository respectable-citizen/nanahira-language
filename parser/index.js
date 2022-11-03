const Tokens = require("../lexer/tokens");
const Nodes = require("./nodes");
const Error = require("../error");

/*
Parser grammar:

program := declaration*

declaration := functionDeclaration | variableDeclaration

parameters := IDENTIFIER IDENTIFIER ("," IDENTIFIER IDENTIFIER)*
arguments = expression ("," expression)*

block := "{" (variableDeclaration | statement)* "}"

//Base expression
expression := equality ";"
equality := comparison (("!=" | "==") comparison)*
comparison := term ((">" | ">=" | "<" | "<=") term )*
term := factor (( "-" | "+" ) factor)*
factor := unary (( "/" | "*" ) unary)*
unary := (( "!" | "-" ) unary) | primary
primary := NUMBER | "(" expression ")" | IDENTIFIER | callExpression

//Expressions
assignmentExpression := IDENTIFIER ["=" expression]
callExpression := IDENTIFIER "(" [arguments] ")"

//Declarations
functionDeclaration := IDENTIFIER IDENTIFIER "(" [parameters] ")" block
variableDeclaration = IDENTIFIER assignmentExpression ";" //Same as assignmentExpression, but with a data type because the variable is being declared for the first time

//Statements
statement := expressionStatement | returnStatement

expressionStatement := (assignmentExpression | callExpression) ";"
returnStatement := "return" expression ";"

*/

class Parser {
    constructor(code, tokens) {
        this.code = code;
        this.tokens = tokens;
        this.pos = 0;
    }

	parserError(message) {
		let lineTokens = this.getLineTokens(this.peek().line);
		let startLine = lineTokens[0].start;
		let endLine = lineTokens[lineTokens.length - 1].end;
		let line = this.code.substring(startLine, endLine);

		Error.reportError(this.peek().line, line, message, this.peek().start - startLine);
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
        this.declarations = [];
        while (!this.atEnd()) this.declarations.push(this.parseDeclaration());

        return this.declarations;
    }

    determineDeclarationType() {
        if (this.peek().type != Tokens.IDENTIFIER) return Nodes.NONE;
        if (this.peekNext().type != Tokens.IDENTIFIER) return Nodes.NONE;
        
        let token = this.peekOffset(2);

        if (token.type == Tokens.LEFT_PAREN) return Nodes.FUNCTION_DECLARATION;

        return Nodes.VARIABLE_DECLARATION;
    }

	determineExpressionStatementType() {
		if (this.peek().type != Tokens.IDENTIFIER) return Nodes.NONE;
	
		let token = this.peekNext();
		if (token.type == Tokens.LEFT_PAREN) return Nodes.CALL_EXPRESSION;
		if (token.type == Tokens.EQUAL) return Nodes.ASSIGNMENT_EXPRESSION;
	
		return Nodes.NONE;
	}

    parseDeclaration() {
        let declarationType = this.determineDeclarationType();

        if (declarationType == Nodes.FUNCTION_DECLARATION) return this.parseFunctionDeclaration();
        if (declarationType == Nodes.VARIABLE_DECLARATION) return this.parseVariableDeclaration();
        
        this.unexpectedToken();
    }

    parseFunctionDeclaration() {
        let returnType = this.get();
        let identifier = this.get();
        this.expect(Tokens.LEFT_PAREN);
        let parameters = [];
        if (this.peek().type != Tokens.RIGHT_PAREN) parameters = this.parseParameters();
        this.expect(Tokens.RIGHT_PAREN);
        let block = this.parseBlock();

        return {
            type: Nodes.FUNCTION_DECLARATION,
            returnType,
            identifier,
            parameters,
            block
        };
    }

    parseVariableDeclaration() {
        let dataType = this.get();
        let assignment = this.parseAssignmentExpression();
        assignment.type = Nodes.VARIABLE_DECLARATION;
        assignment.dataType = dataType;
		assignment.start = dataType.start;
		assignment.end = this.peek().end;
        
		this.expect(Tokens.END_OF_LINE);
        
		return assignment;
    }

    parseStatement() {
        if (this.peek().type == Tokens.KEYWORD_RETURN) return this.parseReturnStatement();
        if (this.peek().type == Tokens.IDENTIFIER) return this.parseExpressionStatement();
        
		this.unexpectedToken();
    }

    parseExpressionStatement() {
		let expressionStatementType = this.determineExpressionStatementType();
		let expression;

		if (expressionStatementType == Nodes.CALL_EXPRESSION) expression = this.parseCallExpression();
		if (expressionStatementType == Nodes.ASSIGNMENT_EXPRESSION) expression = this.parseAssignmentExpression();
		if (!expression) this.unexpectedToken();
    	
		this.expect(Tokens.END_OF_LINE);

		return {
			type: Nodes.EXPRESSION_STATEMENT,
			expression,
			end: this.previous().end
		};
	}

    parseReturnStatement() {
		let start = this.peek().start;
        
		this.expect(Tokens.KEYWORD_RETURN);
        let expression = this.parseExpression();
        this.expect(Tokens.END_OF_LINE);

        return {
            type: Nodes.RETURN_STATEMENT,
            expression,
			start,
			end: this.previous().end
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

            let dataType = this.get();
            let identifier = this.get();

            parameters.push({
                type: Nodes.PARAMETER,
                dataType,
                identifier
            });
        }

        return parameters;
    }

    parseAssignmentExpression() {
        let identifier = this.get();
        
        let expression;
        let operator;
        if (this.match([Tokens.EQUAL, Tokens.PLUS_EQUAL, Tokens.MINUS_EQUAL, Tokens.STAR_EQUAL, Tokens.SLASH_EQUAL])) {
            operator = this.previous();
            expression = this.parseExpression();
        }

        return {
            type: Nodes.ASSIGNMENT_EXPRESSION,
            identifier,
            operator,
            expression
        };
    }

    parseCallExpression() {
        let identifier = this.get();
        
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

        while (this.match([Tokens.STAR, Tokens.SLASH])) {
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
            value: this.previous().value
        };

		if (this.match(Tokens.STRING_LITERAL)) return {
            type: Nodes.STRING_LITERAL,
            value: this.previous().value
        };

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
                return {
                    type: Nodes.VARIABLE,
                    value: this.get()
                };
            }
        }


        this.unexpectedToken();
    }
}

module.exports = Parser;
