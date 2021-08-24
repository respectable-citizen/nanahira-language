const Tokens = require("./tokens");
const Nodes = require("./nodes");

/*
Parser grammar:

program := declaration*

declaration := functionDeclaration

functionDeclaration := IDENTIFIER IDENTIFIER "(" [parameters] ")" block

parameters := identifierDefinition ("," identifierDefinition)*
block := "{" assignmentExpression* "}"
identifierDefinition = IDENTIFIER IDENTIFIER //Data type then name

expression := equality ";"
equality := comparison (("!=" | "==") comparison)* ";"
comparison := term ((">" | ">=" | "<" | "<=") term )* ";"
term := factor (( "-" | "+" ) factor)* ";"
factor := unary (( "/" | "*" ) unary)* ";"
unary := (( "!" | "-" ) unary) | primary ";"
primary := NUMBER | "(" expression ")" ";"

//Expressions
assignmentExpression := identifierDefinition ["=" expression] ";"

*/

class Parser {
    constructor(code, tokens) {
        this.code = code;
        this.tokens = tokens;
        this.pos = 0;
    }

    getLineTokens(line) {
        return this.tokens.filter(token => token.line == line);
    }

    error(message) {
        let lineTokens = this.getLineTokens(this.peek().line);
        let startLine = lineTokens[0].start;
        let endLine = lineTokens[lineTokens.length - 1].end;
        let line = this.code.substring(startLine, endLine);

        console.log(`ERROR on line ${this.peek().line}!`);
        console.log(line);
        console.log(`Error: ${message}`);
        throw "TODO: Implement synchronization for errors (this will allow the compiler to keep parsing even after an error)";
    }

    atEnd() {
        return this.peek().type == Tokens.END_OF_FILE;
    }

    advance() {
        this.pos++;
    }

    peek() {
        return this.tokens[this.pos];
    }

    previous() {
        return this.tokens[this.pos - 1];
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
        if (!this.match(tokenType)) this.error(`Expected token ${tokenType} but got ${this.peek().type}`);
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

    parseIdentifierDefinition() {
        let dataType = this.expect(Tokens.IDENTIFIER);
        let identifier = this.expect(Tokens.IDENTIFIER);
        return {dataType, identifier};
    }

    parseDeclaration() {
        return this.parseFunctionDeclaration();
    }

    parseBlock() {
        this.expect(Tokens.LEFT_CURLY_BRACE);
        
        let lines = [];
        while (this.peek().type != Tokens.RIGHT_CURLY_BRACE) lines.push(this.parseAssignmentExpression());
        
        this.expect(Tokens.RIGHT_CURLY_BRACE);
        return lines;
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

    parseParameters() {
        let parameters = [];
        while (this.peek().type != Tokens.RIGHT_PAREN) {
            let identifierDefinition = this.parseIdentifierDefinition();
            parameters.push(identifierDefinition);
        }

        return parameters;
    }

    parseAssignmentExpression() {
        let identifierDefinition = this.parseIdentifierDefinition();
        let expression;
        if (this.match(Tokens.OPERATOR_ASSIGN)) {
            expression = this.parseExpression();
        }
        this.expect(Tokens.END_OF_LINE);

        return {
            type: Nodes.ASSIGNMENT_EXPRESSION,
            dataType: identifierDefinition.dataType,
            identifier: identifierDefinition.identifier,
            expression
        };
    }

    parseExpression() {
        return this.parseEquality();
    }

    parseEquality() {
        let expression = this.parseComparison();

        while (this.match([Tokens.OPERATOR_EQUALITY, Tokens.OPERATOR_NOT_EQUALITY])) {
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

        while (this.match([Tokens.OPERATOR_GREATER_THAN_EQUAL, Tokens.OPERATOR_LESS_THAN_EQUAL, Tokens.OPERATOR_GREATER_THAN, Tokens.OPERATOR_LESS_THAN])) {
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

        while (this.match([Tokens.OPERATOR_ADD, Tokens.OPERATOR_SUBTRACT])) {
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

        while (this.match([Tokens.OPERATOR_MULTIPLY, Tokens.OPERATOR_DIVIDE])) {
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
        if (this.match([Tokens.OPERATOR_NEGATE, Tokens.OPERATOR_NOT])) {
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
        if (this.match(Tokens.INTEGER_LITERAL)) return this.previous();

        if (this.match(Tokens.LEFT_PAREN)) {
            let expression = this.parseExpression();
            this.expect(Tokens.RIGHT_PAREN);
            return expression;
        }

        throw `Unexpected token ${JSON.stringify(this.peek())}`;
    }
}

module.exports = Parser;