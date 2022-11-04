const Tokens = require("../lexer/tokens");
const Nodes = require("../parser/nodes");
const Types = require("./types");
const Error = require("../error");

const Scope = require("./scope");

const Assembly = require("./assembly").Assembly;
const Memory = require("./memory");

//TODO: Fully implement data types
class CodeGenerator {
    constructor(ast) {
        this.scope = new Scope();
        this.assembly = new Assembly(this.scope);
		this.memory = new Memory(this.assembly);

        this.ast = ast;
        this.functions = this.ast.filter(node => node.type == Nodes.FUNCTION_DECLARATION);

		this.currentStatement;          //Stores the statement that is currently being generated.
		this.currentFunction;           //Stores the function that is currently being generated.

        //Add primitive data types
        for (let dataType of Types) {
            this.scope.addDataType(dataType);
        }
    }

	getFunctionNode(identifier) {
		return this.functions.filter(node => node.identifier.value == identifier)[0];
	}

    generateFunction(func) {
		this.currentFunction = func;
		this.assembly.startFunction(func.identifier.value);

		if (func.identifier.value == "asm") throw new Error.Generator(`Function name "asm" is reserved`, func.identifier.start);
		if (func.identifier.value == "syscall") throw new Error.Generator(`Function name "syscall" is reserved`, func.identifier.start);

		//Check if function should be returning something
		if (this.currentFunction.returnType.value != "void") {
			//TODO: More comprehensive return checking, this does not check for return statements in loops, conditionals, etc
			let returnStatements = this.currentFunction.block.filter(statement => statement.type == Nodes.RETURN_STATEMENT);
			if (returnStatements.length == 0) throw new Error.Generator(`Function "${func.identifier.value}" does not return any value but has non-void return type "${func.returnType.value}"`, this.currentFunction.returnType.start);
		}

		this.assembly.addInstruction(`push rbp`); //Save old base pointer to the stack
		this.assembly.addInstruction(`mov rbp, rsp`); //Use current stack pointer as new base pointer

		//Handle parameters
		for (let parameterIndex = this.currentFunction.parameters.length - 1; parameterIndex >= 0; parameterIndex--) {
			let parameter = this.currentFunction.parameters[parameterIndex];

			let register = this.memory.allocateRegister();

			let baseOffset = 16 + (16 * parameterIndex); //Plus 16 to skip old base pointer and return address
			this.assembly.addInstruction(`mov ${register}, [rbp + ${baseOffset}]`); //Move argument from stack into register
		
			this.scope.addVariable(parameter.identifier.value, {
				type: "register",
				loc: register
			}, parameter.dataType.value);
		}

        this.generateBlock(this.currentFunction.block);
	
		this.assembly.finishFunction();
    }

    generateVariableDeclaration(statement) {
        let identifier = statement.identifier.value;

        if (this.scope.getVariable(identifier)) {
			Error.error(`Variable "${identifier}" has already been declared`, statement);
        }

        let dataType = statement.dataType.value;
        if (!this.scope.getDataType(dataType)) throw new Error.Generator(`Data type "${dataType}" does not exist.`, statement.dataType.start);

		//Check if variable has been initialized
		if (statement.expression) {
        	//Generate code to evaluate expression
        	let loc = this.generateExpression(statement.expression);
		
        	//Add variable to function scope
	        this.scope.addVariable({
				name: identifier,
				loc,
				dataType
			});
		} else {
			if (statement.array) {
				if (!statement.arraySize) throw new Error.Generator(`Cannot leave array uninitialized without providing array size.`, statement.bracketStart);

				this.assembly.bss.labels.push(new Label(statement.identifier.value, `resb ${(this.getSizeFromDataType(dataType) / 8 * statement.arraySize.value)}`));

				//Add variable to function scope
	        	this.scope.addVariable(identifier, {
					type: "memory",
					loc: statement.identifier.value
				}, dataType);
			} else {
				throw "Compiler does not currently supporting declaring variables without initialization";
			}
		}

		//Ensure register isn't storing a value unfit for the data type 
        //this.sizeRegisterToDataType(register, dataType); 
    }

    generateExpression(expression) {
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
			loc.index = expression.arrayIndex.value;

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
			let arrayDataType = this.currentStatement.dataType.value;

			//Determine name for label
			let variableName;
			if (this.currentStatement.type == Nodes.VARIABLE_DECLARATION || this.currentStatement.type == Nodes.ASSIGNMENT_EXPRESSION) {
				variableName = this.currentStatement.identifier.value;
			} else {
				throw `Cannot use array in statement of type ${this.currentStatement.type}`;
			}
			
			//Allocate array in the data section
			return this.memory.allocateArray(variableName, arrayDataType, expression.values.map(x => x.value));
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

    generateReturnStatement(statement) {
    	let loc = this.memory.retrieveFromLocation(this.generateExpression(statement.expression));
		
		if (this.assembly.currentFunction == "main") {
			//Since this is the main function, the return value should be used as an exit code
			//This uses a Linux syscall which isn't ideal but is useful for short-term testing
			this.assembly.addInstruction(`mov rax, 60`);
			this.assembly.addInstruction(`mov rdi, ${loc}`);
			this.assembly.addInstruction(`syscall`);
		} else {
    		this.assembly.addInstruction(`mov rax, ${loc}`); //rax is the designated return register
			this.memory.freeRegister(loc);
		
			this.assembly.addInstruction(`pop rbp`); //Restore old base pointer
		
			let argumentBytes = 16 * this.currentFunction.parameters.length;
			this.assembly.addInstruction(`ret ${argumentBytes}`); //Ignore the part of the stack used for arguments
		}
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
		this.assembly.addInstruction(`mov rsi, ${statement.args[2].value.value}`);
		this.assembly.addInstruction(`mov rdx, ${statement.args[3].value.value}`);
		this.assembly.addInstruction(`syscall`);
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

    generateBlock(block) {
        for (let statement of block) {
			this.currentStatement = statement;

			try {
            	if (statement.type == Nodes.VARIABLE_DECLARATION) {
                	this.generateVariableDeclaration(statement);
            	} else if (statement.type == Nodes.RETURN_STATEMENT) {
                	this.generateReturnStatement(statement);
            	} else if (statement.type == Nodes.EXPRESSION_STATEMENT) {
					if (statement.expression.type == Nodes.ASSIGNMENT_EXPRESSION) {
                		this.generateAssignmentExpression(statement.expression);
            		} else if (statement.expression.type == Nodes.CALL_EXPRESSION) {
						this.generateCallExpression(statement.expression);
					} else {
						throw `Cannot generate expression statement with type ${statement.expression.type}`;
					}
				} else {
					throw `Cannot generate statement of type ${statement.type}`;
				}
			} catch (e) {
				if (e.name == "CodeGeneratorError") {
					Error.error(e.message, statement, e.arrow);
				} else {
					throw e;
				}
			}
        }
    }

    run() {
        if (!this.getFunctionNode("main")) throw "Missing main function.";

        for (let func of this.functions) {
			try {
				this.generateFunction(func);
			} catch(e) {
				if (e.name == "CodeGeneratorError") {
					Error.error(e.message, func, e.arrow);
				} else {
					throw e;
				}
			}
		}
		
		this.output = this.assembly.output();
    }
}

module.exports = CodeGenerator;
