const Nodes = require("../parser/nodes");

class ExpressionGenerator {
	constructor(scope, assembly, memory) {
		this.scope = scope;
		this.assembly = assembly;
		this.memory = memory;
	}

	generateExpression(expression) {
		//Some values necessary for generating arrays, string literals are included because they are stored as byte arrays
		let arrayDataType;
		let variableName;

		if (expression.type == Nodes.ARRAY || expression.type == Nodes.STRING_LITERAL) {
			arrayDataType = this.assembly.currentStatement.dataType.value;

			//Determine name for label
			if (this.assembly.currentStatement.type == Nodes.VARIABLE_DECLARATION || this.assembly.currentStatement.type == Nodes.ASSIGNMENT_EXPRESSION) {
				variableName = this.assembly.currentStatement.identifier.value;
			} else {
				throw `Cannot use array in statement of type ${this.assembly.currentStatement.type}`;
			}
		}

		if (expression.type == Nodes.INTEGER_LITERAL) {
			let register = this.memory.allocateRegister();
			this.assembly.addInstruction(`mov ${register}, ${expression.value.value}`);

			return {
				type: "register",
				loc: register
			};
		} else if (expression.type == Nodes.BINARY_EXPRESSION) {
			let leftRegister;
			let rightRegister;

			//Evaluate binary expressions first, as to not waste registers by loading in unused values
			if (expression.left.type == Nodes.BINARY_EXPRESSION) {
				leftRegister = this.generateExpression(expression.left);
				rightRegister = this.generateExpression(expression.right);
			} else {
				rightRegister = this.generateExpression(expression.right);
				leftRegister = this.generateExpression(expression.left);
			}

			if (expression.operator == Tokens.PLUS) {
				this.assembly.addInstruction(`add ${leftRegister}, ${rightRegister}`);

				this.memory.freeRegister(rightRegister);

				return {
					type: "register",
					loc: leftRegister
				};
			} else if (expression.operator == Tokens.MINUS) {
				this.assembly.addInstruction(`sub ${leftRegister}, ${rightRegister}`);

				this.memory.freeRegister(rightRegister);

				return {
					type: "register",
					loc: leftRegister
				};
			} else if (expression.operator == Tokens.STAR) {
				this.assembly.addInstruction(`imul ${leftRegister}, ${rightRegister}`);

				this.memory.freeRegister(rightRegister);

				return {
					type: "register",
					loc: leftRegister
				};
			} else if (expression.operator == Tokens.SLASH) {
				//Ensure dividend is in RAX
				if (leftRegister != "rax") {
					this.assembly.addInstruction(`mov rax, ${leftRegister}`);
					this.memory.freeRegister(leftRegister);
				}
				//Ensure RDX is 0 as it forms the high-half of the dividend
				this.assembly.addInstruction(`mov rdx, 0`);

				this.assembly.addInstruction(`div ${rightRegister}`);
				this.memory.freeRegister(rightRegister);

				return {
					type: "register",
					loc: "rax"
				};
			}

			throw `Cannot currently handle operator "${expression.operator}"`;
		} else if (expression.type == Nodes.VARIABLE) {
			let variable = this.scope.getVariable(expression.value.value);
			if (!variable) throw new Error.Generator(`Variable "${expression.value.value}" does not exist`, expression.value.start);

			let loc = structuredClone(variable.loc);
			if (expression.arrayIndex) loc.index = expression.arrayIndex.value;

			return loc;
		} else if (expression.type == Nodes.UNARY_EXPRESSION) {
			if (expression.operator == Tokens.MINUS) {
				let expressionRegister = this.generateExpression(expression.expression);

				this.assembly.addInstruction(`neg ${expressionRegister}`);

				return {
					type: "register",
					loc: expressionRegister
				};
			}

			throw `Cannot currently handle operator "${expression.operator}"`;
		} else if (expression.type == Nodes.CALL_EXPRESSION) {
			let func = this.getFunction(expression.identifier.value);
			if (func.returnType.value == "void") throw new Error.Generator(`Cannot use return value of function in expression as it returns void`, expression.identifier.start);

			return this.generateCallExpression(expression); //Return data from function is always in rax
		} else if (expression.type == Nodes.ARRAY) {	
			//Allocate array pm the stack
			return this.memory.allocateArrayStack(variableName, arrayDataType, expression.values.map(x => x.value));
		} else if (expression.type == Nodes.STRING_LITERAL) {
			//Allocate string on the stack, string is stored as byte array
			return this.memory.allocateArrayStack(variableName, arrayDataType, expression.value.value.split("").map(x => x.charCodeAt(0)));
		}

		throw `Cannot currently handle expression "${expression.type}".`;
	}

    generateAssignmentExpression(statement) {
        let variable = this.scope.getVariable(statement.identifier.value);
		if (!variable) {
			throw new Error.Generator(`Cannot assign to variable "${statement.identifier.value}" because it does not exist`, statement.identifier.start);
		}

        if (variable.loc.type == "register") {
            let expressionValueRegister;

            if (statement.operator.type == Tokens.EQUAL) {
                expressionValueRegister = this.generateExpression(statement.expression);
            } else {
                let expression = {
                    type: Nodes.BINARY_EXPRESSION,
                    operator: statement.operator.type.split("_EQUAL").join(""),
                    left: {
                        type: Nodes.VARIABLE,
                        value: {
                            value: statement.identifier.value
                        }
                    },
                    right: statement.expression                    
                };

                expressionValueRegister = this.generateExpression(expression);
            }
            
            if (variable.loc.loc != expressionValueRegister) this.assembly.addInstruction(`mov ${variable.loc.loc}, ${expressionValueRegister}`);
        
            this.sizeRegisterToDataType(variable.loc.loc, variable.dataType);    
        }
    }

	generateCallExpression(statement) {
		if (statement.identifier.value == "asm") return this.generateASMCall(statement);
		if (statement.identifier.value == "syscall") return this.generateSyscall(statement);

		for (let argument of statement.args) {
			if (argument.type == Nodes.VARIABLE) {
				let variable = this.scope.getVariable(argument.value.value);
				if (!variable) throw new Error.Generator(`Cannot use variable "${argument.value.value}" as an argument because it does not exist`, argument.value.start);

				if (variable.loc.type != "register") throw "No support for non-register arguments when calling functions";
			
				this.assembly.addInstruction(`push ${variable.loc.loc}`);
			} else if (argument.type == Nodes.CALL_EXPRESSION) {
				let register = this.generateCallExpression(argument);

				this.assembly.addInstruction(`push ${register}`);
			} else if (argument.type == Nodes.INTEGER_LITERAL) {
				let register = this.generateExpression(argument);

				this.assembly.addInstruction(`push ${register}`);
			} else {
				throw `Cannot use ${argument.type} as function argument`;
			}
		}

		this.assembly.addInstruction(`call ${statement.identifier.value}`);

		return "rax"; //rax is the designated return register
	}

	generateASMCall(statement) {
		if (statement.args.length != 1) throw new Error.Generator("asm() takes 1 argument", statement.identifier.end);
		if (statement.args[0].type != Nodes.STRING_LITERAL) throw new Error.Generator("asm() argument must be a string", statement.args[0].value.start);
		
		this.assembly.addInstruction(statement.args[0].value.value);
	}

	generateSyscall(statement) {
		if (statement.args.length != 4) throw new Error.Generator("syscall() takes 4 arguments", statement.identifier.end);
		if (statement.args[0].type != Nodes.INTEGER_LITERAL) throw new Error.Generator("syscall number must be an integer", statement.args[0].value.start);
		
		this.assembly.addInstruction(`mov rax, ${statement.args[0].value.value}`);
		this.assembly.addInstruction(`mov rdi, ${statement.args[1].value.value}`);
		this.memory.moveLocationIntoRegister("rsi", this.generateExpression(statement.args[2]));
		this.assembly.addInstruction(`mov rdx, ${statement.args[3].value.value}`);
		this.assembly.addInstruction(`syscall`);
	}
}

module.exports = ExpressionGenerator;
