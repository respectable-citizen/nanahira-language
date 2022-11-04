const Tokens = require("../lexer/tokens");
const Nodes = require("../parser/nodes");
const Types = require("./types");
const Error = require("../error");

const {GlobalScope, FunctionScope, VariableScope, DataTypeScope} = require("./scope");

const {Label, Section, Assembly} = require("./assembly");

//TODO: Fully implement data types
class CodeGenerator {
    constructor(ast) {
        this.assembly = new Assembly();
        this.ast = ast;
        this.functions = this.ast.filter(node => node.type == Nodes.FUNCTION_DECLARATION);

        this.instructions = []; //Buffer for storing instructions.

        this.registers = {
            //"rax": true,  Reserved for div instruction and returning up to 64 bits from functions
            "rbx": true,
            "rcx": true,
            //"rdx": true,  Reserved for div instruction
            //"rbp": true,  Reserved for stack
            //"rsp": true,  Reserved for stack
            "rsi": true,
            "rdi": true,
            "r8":  true,
            "r9":  true,
            "r10":  true,
            "r11":  true,
            "r12":  true,
            "r13":  true,
            "r14":  true,
            "r15":  true,
        };

        this.currentFunc;               //Stores the function that is currently being parsed.
		this.currentStatement;          //Stores the statement that is currently being parsed.
        this.scope = new GlobalScope(); //Stores scope information for semantic analysis and such

        //Add primitive data types
        for (let type in Types) {
            this.scope.addDataType(type);
        }
    }

	//Returns size in bits of a given data type
	getSizeFromDataType(dataType) {
		if (dataType == "uint8" || dataType == "int8") return 8;
		if (dataType == "uint16" || dataType == "int16") return 16;
		if (dataType == "uint32" || dataType == "int32") return 32;
		if (dataType == "uint64" || dataType == "int64") return 64;

		throw `Cannot determine size of data type "${dataType}"`;
	}

	//Generates corresponding assembly code that represents the location of that data (registers/memory/stack)
	retrieveFromLocation(loc) {
		if (loc.type == "register") return loc.loc;
		else if (loc.type == "memory") {
			let variable = this.getCurrentFunction().getVariable(loc.loc);
			let bytesPerElement = this.getSizeFromDataType(variable.dataType) / 8;
			
			let memoryOffset = "";
			if (loc.index) memoryOffset = ` + ${loc.index * bytesPerElement}`;
			return `[${loc.loc}${memoryOffset}]`;
		}

		throw `Cannot handle location type ${loc.type}`;
	}

    //Returns the scope of the current function being parsed
    getCurrentFunction() {
        return this.scope.getFunction(this.currentFunc);
    }

    addInstruction(instruction) {
        this.instructions.push(instruction);
    }

    getInstructions() {
        let instructions = this.instructions;
        this.instructions = [];

        return instructions;
    }

    allocateRegister() {
        for (let register in this.registers) {
            if (this.registers[register]) {
                this.registers[register] = false;
                return register;
            }
        }

        throw "Ran out of registers to allocate.";
    }

    freeRegister(register) {
        this.registers[register] = true;
    }

    getFunction(identifier) {
        return this.functions.filter(node => node.identifier.value == identifier)[0];
    }

	convertRegisterNameToSize(register, bits) {
		if (bits == 32) return register.replace("r", "e");
		if (bits == 16) return register.replace("r", "");
		if (bits == 8) return register.replace("r", "").replace("x", "l");

		throw `Invalid bit count ${bits}`;
	}

    sizeRegisterToDataType(register, dataType) {
        //Clear correct number of bits depending on data type
        let registerName;
        if (dataType == "uint32" || dataType == "int32") {
            registerName = this.convertRegisterNameToSize(register, 32);
        } else if (dataType == "uint16" || dataType == "int16") {
            registerName = this.convertRegisterNameToSize(register, 16);
        } else if (dataType == "uint8" || dataType == "int8") {
            registerName = this.convertRegisterNameToSize(register, 8);
        }

        //Check if we actually need to clear any bits
        if (registerName) {
            this.addInstruction(`mov ${registerName}, ${registerName}`);
        }
    }

    generateFunction(identifier) {
        let func = this.getFunction(identifier);
        this.currentFunc = identifier; //Set the current function being generated
		
		if (identifier == "asm") throw new Error.Generator(`Function name "asm" is reserved`, func.identifier.start);

		//Check if function should be returning something
		if (func.returnType.value != "void") {
			//TODO: More comprehensive return checking, this does not check for return statements in loops, conditionals, etc
			let returnStatements = func.block.filter(statement => statement.type == Nodes.RETURN_STATEMENT);
			if (returnStatements.length == 0) throw new Error.Generator(`Function "${identifier}" does not return any value but has non-void return type "${func.returnType.value}"`, func.returnType.start);
		}

        this.scope.addFunction(identifier, func.returnType.value); //Create a scope entry

		this.addInstruction(`push rbp`); //Save old base pointer to the stack
		this.addInstruction(`mov rbp, rsp`); //Use current stack pointer as new base pointer

		//Handle parameters
		for (let parameterIndex = func.parameters.length - 1; parameterIndex >= 0; parameterIndex--) { //Iterate through parameters in reverse because we have to pop off the stack in the reverse of the order we pushed the data onto it
			let parameter = func.parameters[parameterIndex];

			let register = this.allocateRegister();

			let baseOffset = 16 + (16 * parameterIndex); //Plus 16 to skip old base pointer and return address
			this.addInstruction(`mov ${register}, [rbp + ${baseOffset}]`); //Move argument from stack into register
		
			this.getCurrentFunction().addVariable(parameter.identifier.value, {
				type: "register",
				loc: register
			}, parameter.dataType.value);
		}

        let instructions = this.generateBlock(func.block);
        this.scope.cleanFunction(identifier);                      //We are done parsing the function, clean it up

        this.assembly.text.labels.push(new Label(identifier, instructions));
    }

    generateVariableDeclaration(statement) {
        let identifier = statement.identifier.value;

        if (this.getCurrentFunction().getVariable(identifier)) {
			Error.error(`Variable "${identifier}" has already been declared`, statement);
        }

        let dataType = statement.dataType.value;
        if (!this.scope.getDataType(dataType)) throw new Error.Generator(`Data type "${dataType}" does not exist.`, statement.dataType.start);

		//Check if variable has been initialized
		if (statement.expression) {
        	//Generate code to evaluate expression
        	let loc = this.generateExpression(statement.expression);
		

        	//Add variable to function scope
	        this.getCurrentFunction().addVariable(identifier, loc, dataType);
		} else {
			if (statement.array) {
				if (!statement.arraySize) throw new Error.Generator(`Cannot leave array uninitialized without providing array size.`, statement.bracketStart);

				this.assembly.bss.labels.push(new Label(statement.identifier.value, `resb ${(this.getSizeFromDataType(dataType) / 8 * statement.arraySize.value)}`));

				//Add variable to function scope
	        	this.getCurrentFunction().addVariable(identifier, {
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
            let register = this.allocateRegister();
            this.addInstruction(`mov ${register}, ${expression.value.value}`);
            
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
                this.addInstruction(`add ${leftRegister}, ${rightRegister}`);

                this.freeRegister(rightRegister);
            	
				return {
					type: "register",
					loc: leftRegister
				};
            } else if (expression.operator == Tokens.MINUS) {
                this.addInstruction(`sub ${leftRegister}, ${rightRegister}`);

                this.freeRegister(rightRegister);
	
				return {
					type: "register",
					loc: leftRegister
				};
            } else if (expression.operator == Tokens.STAR) {
                this.addInstruction(`imul ${leftRegister}, ${rightRegister}`);

                this.freeRegister(rightRegister);

				return {
					type: "register",
					loc: leftRegister
				};
            } else if (expression.operator == Tokens.SLASH) {
                //Ensure dividend is in RAX
                if (leftRegister != "rax") {
                    this.addInstruction(`mov rax, ${leftRegister}`);
                    this.freeRegister(leftRegister);
                }
                
                //Ensure RDX is 0 as it forms the high-half of the dividend
                this.addInstruction(`mov rdx, 0`);

                this.addInstruction(`div ${rightRegister}`);
                this.freeRegister(rightRegister);

                return {
					type: "register",
					loc: "rax"
				};
            }

			throw `Cannot currently handle operator "${expression.operator}"`;
        } else if (expression.type == Nodes.VARIABLE) {
            let variable = this.getCurrentFunction().getVariable(expression.value.value);
			if (!variable) throw new Error.Generator(`Variable "${expression.value.value}" does not exist`, expression.value.start);
			
			let loc = structuredClone(variable.loc);
			loc.index = expression.arrayIndex.value;

			return loc;
        } else if (expression.type == Nodes.UNARY_EXPRESSION) {
            if (expression.operator == Tokens.MINUS) {
				let expressionRegister = this.generateExpression(expression.expression);

            	this.addInstruction(`neg ${expressionRegister}`);
            	
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
			let variableName;
			if (this.currentStatement.type == Nodes.VARIABLE_DECLARATION || this.currentStatement.type == Nodes.ASSIGNMENT_EXPRESSION) {
				variableName = this.currentStatement.identifier.value;
			} else {
				throw `Cannot use array in statement of type ${this.currentStatement.type}`;
			}

			let assemblyDeclareSizeBits = this.getSizeFromDataType(arrayDataType);
			let assemblyDeclareSize;
			if (assemblyDeclareSizeBits == 8) assemblyDeclareSize = "db";
			else if (assemblyDeclareSizeBits == 16) assemblyDeclareSize = "dw";
			else if (assemblyDeclareSizeBits == 32) assemblyDeclareSize = "dd";
			else if (assemblyDeclareSizeBits == 64) assemblyDeclareSize = "dq";
			
			if (!assemblyDeclareSize) throw `Unable to reserve size of ${assemblyDeclareSizeBits} bits`;

			this.assembly.data.labels.push(new Label(variableName, `${assemblyDeclareSize} ${expression.numbers.map(x => x.value).join(", ")}`));
			
			return {
				type: "memory",
				loc: variableName
			};
		}

        throw `Cannot currently handle expression "${expression.type}".`;
    }

    generateAssignmentExpression(statement) {
        let variable = this.getCurrentFunction().getVariable(statement.identifier.value);
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
            
            if (variable.loc.loc != expressionValueRegister) this.addInstruction(`mov ${variable.loc.loc}, ${expressionValueRegister}`);
        
            this.sizeRegisterToDataType(variable.loc.loc, variable.dataType);    
        }
    }

    generateReturnStatement(statement) {
    	let loc = this.retrieveFromLocation(this.generateExpression(statement.expression));
		
		if (this.currentFunc == "main") {
			//Since this is the main function, the return value should be used as an exit code
			//This uses a Linux syscall which isn't ideal but is useful for short-term testing
			this.addInstruction(`mov rax, 60`);
			this.addInstruction(`mov rdi, ${loc}`);
			this.addInstruction(`syscall`);
		} else {
    		this.addInstruction(`mov rax, ${loc}`); //rax is the designated return register
			this.freeRegister(register);
		
			this.addInstruction(`pop rbp`); //Restore old base pointer
		
			let argumentBytes = 16 * this.getFunction(this.currentFunc).parameters.length;
			this.addInstruction(`ret ${argumentBytes}`); //Ignore the part of the stack used for arguments
		}
	}

	generateASMCall(statement) {
		if (statement.args.length != 1) throw new Error.Generator("asm() takes 1 argument", statement.identifier.end);
		if (statement.args[0].type != Nodes.STRING_LITERAL) throw new Error.Generator("asm() argument must be a string", statement.args[0].value.start);
		
		this.addInstruction(statement.args[0].value.value);
	}

	generateCallExpression(statement) {
		if (statement.identifier.value == "asm") return this.generateASMCall(statement);

		for (let argument of statement.args) {
			if (argument.type == Nodes.VARIABLE) {
				let variable = this.getCurrentFunction().getVariable(argument.value.value);
				if (!variable) throw new Error.Generator(`Cannot use variable "${argument.value.value}" as an argument because it does not exist`, argument.value.start);

				if (variable.loc.type != "register") throw "No support for non-register arguments when calling functions";
			
				this.addInstruction(`push ${variable.loc.loc}`);
			} else if (argument.type == Nodes.CALL_EXPRESSION) {
				let register = this.generateCallExpression(argument);

				this.addInstruction(`push ${register}`);
			} else if (argument.type == Nodes.INTEGER_LITERAL) {
				let register = this.generateExpression(argument);

				this.addInstruction(`push ${register}`);
			} else {
				throw `Cannot use ${argument.type} as function argument`;
			}
		}

		this.addInstruction(`call ${statement.identifier.value}`);

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

        return this.getInstructions();
    }

    run() {
        if (!this.getFunction("main")) throw "Missing main function.";

        for (let func of this.functions) {
			try {
				this.generateFunction(func.identifier.value);
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
