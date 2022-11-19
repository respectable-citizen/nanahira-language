const Tokens = require("../lexer/tokens");
const Nodes = require("../parser/nodes");
const Error = require("../error");
const Location = require("./location");

class ExpressionGenerator {
	constructor(scope, assembly, memory, ast) {
		this.scope = scope;
		this.assembly = assembly;
		this.memory = memory;
		this.ast = ast;
	}
	
	//Modifies location, must operate on a clone if original must be kept untouched
	indexIntoLocation(loc, index) {
		if (index) {
			if (index.type == Nodes.INTEGER_LITERAL) {
				loc.index = index.value.value;
			} else {
				//Index is an expression, must generate it before setting index
				let indexLocation = this.generateExpression(index);
				let displacementRegister = this.memory.moveLocationIntoRegister("b", indexLocation);
				displacementRegister.dataType.identifier.value = "uint64"; //Effective addressing requires us to have the same register size for base and displacement
				this.memory.freeRegister(indexLocation);
				loc.index = displacementRegister;
			}
		}
	}

	generateExpression(expression) {
		//Some values necessary for generating arrays, string literals are included because they are stored as byte arrays
		let arrayDataType;
		let arrayName;

		if (expression.type == Nodes.ARRAY || expression.type == Nodes.STRING_LITERAL) {
			//Determine name and data type for array
			if (this.assembly.currentStatement.type == Nodes.VARIABLE_DECLARATION || this.assembly.currentStatement.type == Nodes.ASSIGNMENT_EXPRESSION) {
				arrayName = this.assembly.currentStatement.identifier.value;
				arrayDataType = this.assembly.currentStatement.dataType;
			} else {
				arrayName = this.assembly.generateLabel();
				arrayDataType = {
					identifier: {value: "uint8"}
				};
			}
		}

		if (expression.type == Nodes.INTEGER_LITERAL) {
			let loc = this.memory.moveIntegerIntoARegister(+expression.value.value);
			return loc;
		} else if (expression.type == Nodes.BINARY_EXPRESSION) {
			let leftLocation;
			let rightLocation;

			//Evaluate binary expressions first, as to not waste registers by loading in unused values
			if (expression.left.type == Nodes.BINARY_EXPRESSION) {
				leftLocation = this.memory.moveLocationIntoARegister(this.generateExpression(expression.left));
				rightLocation = this.memory.moveLocationIntoARegister(this.generateExpression(expression.right));
			} else {
				leftLocation = this.memory.moveLocationIntoARegister(this.generateExpression(expression.left));
				rightLocation = this.memory.moveLocationIntoARegister(this.generateExpression(expression.right));
			}
			
			//Typecast smaller value in binary expression to be the same as the bigger one
			let smaller;
			let bigger;

			if (this.memory.getSizeFromDataType(leftLocation.dataType) > this.memory.getSizeFromDataType(rightLocation.dataType)) {
				bigger = leftLocation;
				smaller = rightLocation;
			} else {
				bigger = rightLocation;
				smaller = leftLocation;
			}

			let canImplicitlyTypecast = this.memory.implicitlyTypecast(bigger.dataType, smaller.dataType);
			if (!canImplicitlyTypecast) throw new Error.Generator(`Cannot perform binary operation on values of type "${leftLocation.dataType.identifier.value}" and "${rightLocation.dataType.identifier.value}"`, expression.start);
			


			let leftRegister = this.memory.retrieveFromLocation(leftLocation);
			let rightRegister = this.memory.retrieveFromLocation(rightLocation);

			if (expression.operator == Tokens.PLUS) {
				this.assembly.addInstruction(`add ${leftRegister}, ${rightRegister}`);

				this.memory.freeRegister(rightLocation);
				
				return new Location("register", leftLocation.loc, "uint64");
			} else if (expression.operator == Tokens.MINUS) {
				this.assembly.addInstruction(`sub ${leftRegister}, ${rightRegister}`);
				
				this.memory.freeRegister(rightLocation);

				return new Location("register", leftLocation.loc, "uint64");
			} else if (expression.operator == Tokens.STAR) {
				this.assembly.addInstruction(`imul ${leftRegister}, ${rightRegister}`);

				this.memory.freeRegister(rightLocation);

				return new Location("register", leftLocation.loc, "uint64");
			} else if (expression.operator == Tokens.SLASH || expression.operator == Tokens.PERCENT) {
				//Ensure dividend is in RAX
				if (leftRegister != "rax") {
					this.memory.moveLocationIntoRegister("a", leftLocation);
					this.memory.freeRegister(leftLocation);
				}
				//Ensure RDX is 0 as it forms the high-half of the dividend
				this.assembly.addInstruction(`mov rdx, 0`);

				//In 8 bit division, the remainder goes into AH instead of RDX. We cannot address AH so instead we have to upgrade 8 bit division instead 16 bit division
				if (rightLocation.dataType.identifier.value == "int8" || rightLocation.dataType.identifier.value == "uint8") {
					rightLocation.dataType.identifier.value = rightLocation.dataType.identifier.value.replace("8", "16");
					rightRegister = this.memory.retrieveFromLocation(rightLocation);
				}

				this.assembly.addInstruction(`div ${rightRegister}`);
				this.memory.freeRegister(rightLocation);

				return new Location("register", (expression.operator == Tokens.SLASH) ? "a" : "d", "uint64");
			} else if (expression.operator == Tokens.GREATER || expression.operator == Tokens.LESS || expression.operator == Tokens.EQUAL_EQUAL || expression.operator == Tokens.BANG_EQUAL) {
				let mnemonic;
				if (expression.operator == Tokens.LESS) {
					mnemonic = "nl";
				} else if (expression.operator == Tokens.GREATER) {
					mnemonic = "ng";
				} else if (expression.operator == Tokens.EQUAL_EQUAL) {
					mnemonic = "ne";
				} else if (expression.operator == Tokens.BANG_EQUAL) {
					mnemonic = "e";
				}

				let resultRegister = this.memory.moveIntegerIntoARegister(0);
				
				this.assembly.addInstruction(`cmp ${leftRegister}, ${rightRegister}`);

				let skipLabel = "comparison_skip_" + this.assembly.generateLabel();
				this.assembly.addInstruction(`j${mnemonic} ${skipLabel}`);
				this.assembly.addInstruction(`mov ${this.memory.retrieveFromLocation(resultRegister)}, 1`);
				this.assembly.addInstruction(`${skipLabel}:`);

				this.memory.freeRegister(leftLocation);
				this.memory.freeRegister(rightLocation);

				return new Location("register", resultRegister.loc, "uint8");
			}

			throw `Cannot currently handle operator "${expression.operator}"`;
		} else if (expression.type == Nodes.VARIABLE) {
			let variable = this.scope.getVariable(expression.value.value);	
			if (!variable) throw new Error.Generator(`Variable "${expression.value.value}" does not exist`, expression.value.start);
			
			let loc = structuredClone(variable.loc);
			this.indexIntoLocation(loc, expression.arrayIndex);

			//Move value into a register so that the original variable doesn't get freed later on, this is a waste of a register. TODO
			//console.log(loc);
			let newLocation = this.memory.moveLocationIntoARegister(loc, true, loc.index ? true : false);
			
			return newLocation;
		} else if (expression.type == Nodes.UNARY_EXPRESSION) {
			if (expression.operator == Tokens.MINUS) {
				let expressionRegister = this.generateExpression(expression.expression);

				this.assembly.addInstruction(`neg ${expressionRegister}`);

				return new Location("register", expressionRegister, "uint64");
			} else if (expression.operator == Tokens.AMPERSAND) {
				//Address of
				
				if (expression.expression.type != Nodes.VARIABLE) throw new Error.Generator("Can not take address of non-variable expression.", expression.expression.value ? expression.expression.value.start : expression.expression.left.value.start);
				let variable = this.scope.getVariable(expression.expression.value.value);
				if (!variable) throw new Error.Generator(`Variable "${expression.expression.value.value}" does not exist`, expression.expression.value.start);
				
				let loc;
				if (variable.loc.type == "register") {
					//Registers do not have a memory address, so we have to move the variable into memory first
					loc = this.memory.allocateStackSpace(variable.loc.dataType);
					this.memory.locationMove(loc, variable.loc);
				} else {
					loc = structuredClone(variable.loc);
				}

				loc.dataType.pointer = 1; //Location is a single-level pointer
				return loc;
			} else if (expression.operator == Tokens.STAR) {
				//Dereference
				
				let expressionRegister = this.generateExpression(expression.expression);
				//console.log("MOVING IT");
				//console.log(expressionRegister);
				let loc = this.memory.moveLocationIntoARegister(expressionRegister, true, true);

				if (expressionRegister.type == "register") this.memory.freeRegister(expressionRegister);

				return loc;
			}

			throw `Cannot currently handle operator "${expression.operator}"`;
		} else if (expression.type == Nodes.CALL_EXPRESSION) {
			let func = this.ast.getFunctionNode(expression.identifier.value);
			if (func.returnType.value == "void") throw new Error.Generator(`Cannot use return value of function in expression as it returns void`, expression.identifier.start);

			return this.generateCallExpression(expression); //Return data from function is always in rax
		} else if (expression.type == Nodes.ARRAY) {	
			//Allocate array pm the stack
			return this.memory.allocateArrayStack(arrayName, arrayDataType, expression.values.map(x => x.value));
		} else if (expression.type == Nodes.STRING_LITERAL) {
			//Allocate string on the stack, string is stored as byte array
			let values = [];
			let escaping = false;
			for (let character of expression.value.value) {
				if (escaping) {
					if (character == "\\") values.push("\\".charCodeAt(0));
					else if (character == "n") values.push(10);
					else if (character == "0") values.push(0);
					else throw `Unknown escape sequence \\${character}`;

					escaping = false;
					continue;
				}

				if (character == "\\") {
					escaping = true;
					continue;
				}

				values.push(character.charCodeAt(0));
			}
			values.push(0); //Strings are null terminated
			
			return this.memory.allocateArrayStack(arrayName, arrayDataType, values);
		}

		throw `Cannot currently handle expression "${expression.type}".`;
	}

    generateAssignmentExpression(statement) {
        let variable = structuredClone(this.scope.getVariable(statement.identifier.value));
		if (!variable) {
			throw new Error.Generator(`Cannot assign to variable "${statement.identifier.value}" because it does not exist`, statement.identifier.start);
		}

		let expressionValueLocation;

		if (statement.operator.type == Tokens.EQUAL) {
			 expressionValueLocation = this.generateExpression(statement.expression);
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

        	expressionValueLocation = this.generateExpression(expression);
        }
		
		let canImplicitlyTypecast = this.memory.implicitlyTypecast(variable.loc.dataType, expressionValueLocation.dataType);
		if (!canImplicitlyTypecast) throw new Error.Generator(`Attempt to assign expression of data type "${expressionValueLocation.dataType.identifier.value}" to variable of type "${variable.loc.dataType.identifier.value}"`, statement.expression.start);
    	
		this.indexIntoLocation(variable.loc, statement.index);	
	
		if (statement.identifier.value == "testptr") {
			console.log(variable.loc);
			console.log(expressionValueLocation);
		}
		this.memory.locationMove(variable.loc, expressionValueLocation);
		//this.sizeRegisterToDataType(variable.loc.loc, variable.dataType);    
    }

	generateCallExpression(statement) {
		if (statement.identifier.value == "asm") return this.generateASMCall(statement);
		//if (statement.identifier.value == "syscall") return this.generateSyscall(statement);

		let func = this.scope.getFunction(statement.identifier.value);
		if (!func) throw new Error.Generator(`Cannot call function "${statement.identifier.value}" because it does not exist.`, statement.identifier.start);
		if (func.external) this.assembly.makeExtern(func.identifier.value);

		let argumentLocations = [];

		for (let argument of statement.args) {
			let argumentLocation;

			if (argument.type == Nodes.VARIABLE) {
				let variable = this.scope.getVariable(argument.value.value);
				if (!variable) throw new Error.Generator(`Cannot use variable "${argument.value.value}" as an argument because it does not exist`, argument.value.start);

				if (variable.loc.type != "register") throw "No support for non-register arguments when calling functions";
			
				argumentLocation = this.memory.moveLocationIntoARegister(variable.loc, true); //Moves variable into register so when we later free it doesn't free the variable location, this is a waste of a register TODO
			} else if (argument.type == Nodes.CALL_EXPRESSION) {
				argumentLocation = this.generateCallExpression(argument);
			} else if (argument.type == Nodes.INTEGER_LITERAL) {
				argumentLocation = this.generateExpression(argument);
			} else if (argument.type == Nodes.STRING_LITERAL) {
				argumentLocation = this.generateExpression(argument);
			} else {
				throw `Cannot use ${argument.type} as function argument`;
			}
			
			//All arguments are passed as 64-bit numbers, change the data type
			argumentLocation.dataType.identifier.value = "uint64";
			
			argumentLocations.push(argumentLocation);
			//this.assembly.addInstruction(`push ${this.memory.retrieveFromLocation(argumentLocation)}`);
		}
		
		let usedRegisters = this.memory.saveRegisters(); //Push registers onto the stack

		for (let argumentLocation of argumentLocations) {
			this.memory.pushLocation(argumentLocation, false); //Don't update tracked stack pointer because the arguments are popped back off the stack by ret which we don't track
			this.memory.freeRegister(argumentLocation);
		}

		this.assembly.addInstruction(`call ${statement.identifier.value}`);
		this.memory.loadRegisters(usedRegisters);

		return new Location("register", "a", func.returnType); //rax is the designated return register
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
