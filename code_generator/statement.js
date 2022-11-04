const Nodes = require("../parser/nodes");

const ExpressionGenerator = require("./expression");

class StatementGenerator {
	constructor(scope, assembly, memory) {
		this.scope = scope;
		this.assembly = assembly;
		this.memory = memory;

		this.expression = new ExpressionGenerator(this.scope, this.assembly, this.memory);
	}

	generateExpressionStatement(statement) {
		if (statement.expression.type == Nodes.ASSIGNMENT_EXPRESSION) {
			this.expression.generateAssignmentExpression(statement.expression);
		} else if (statement.expression.type == Nodes.CALL_EXPRESSION) {
			this.expression.generateCallExpression(statement.expression);
		} else {
			throw `Cannot generate expression statement with type ${statement.expression.type}`;
		}
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
        	let loc = this.expression.generateExpression(statement.expression);
		
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

	generateReturnStatement(statement) {
    	let loc = this.memory.retrieveFromLocation(this.expression.generateExpression(statement.expression));
		
		if (this.assembly.currentFunctionIdentifier == "main") {
			//Since this is the main function, the return value should be used as an exit code
			//This uses a Linux syscall which isn't ideal but is useful for short-term testing
			this.assembly.addInstruction(`mov rax, 60`);
			this.assembly.addInstruction(`mov rdi, ${loc}`);
			this.assembly.addInstruction(`syscall`);
		} else {
    		this.assembly.addInstruction(`mov rax, ${loc}`); //rax is the designated return register
			this.memory.freeRegister(loc);
		
			this.assembly.addInstruction(`pop rbp`); //Restore old base pointer
		
			let argumentBytes = 16 * this.assembly.currentFunction.parameters.length;
			this.assembly.addInstruction(`ret ${argumentBytes}`); //Ignore the part of the stack used for arguments
		}
	}

}

module.exports = StatementGenerator;
