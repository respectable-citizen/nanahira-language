const Nodes = require("../parser/nodes");
const Error = require("../error");

const ExpressionGenerator = require("./expression");

class StatementGenerator {
	constructor(scope, assembly, memory, ast) {
		this.scope = scope;
		this.assembly = assembly;
		this.memory = memory;
		this.ast = ast;

		this.expression = new ExpressionGenerator(this.scope, this.assembly, this.memory, this.ast);
	}
	
	handleError(func, node, context = this) {
		try {
			func.call(context, node);
		} catch (e) {
			if (e.name == "CodeGeneratorError") {
				Error.error(e.message, node, e.arrow);
			} else {
				throw e;
			}
		}
	}

	generateBlock(block) {
        for (let statement of block) this.handleError(this.generateStatement, statement); 
    }

	generateStatement(statement) {
		this.assembly.currentStatement = statement;
		
		if (statement.type == Nodes.VARIABLE_DECLARATION) {
			this.generateVariableDeclaration(statement);
		} else if (statement.type == Nodes.RETURN_STATEMENT) {
			this.generateReturnStatement(statement);
		} else if (statement.type == Nodes.EXPRESSION_STATEMENT) {
			this.generateExpressionStatement(statement);
		} else if (statement.type == Nodes.IF_STATEMENT) {
			this.generateIfStatement(statement);
		} else {
			throw `Cannot generate statement of type ${statement.type}`;
		}
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

        if (!this.scope.getDataType(statement.dataType.identifier.value)) throw new Error.Generator(`Data type "${statement.dataType.identifier.value}" does not exist.`, statement.dataType.identifier.start);

		//Check if variable has been initialized
		if (statement.expression) {
        	//Generate code to evaluate expression
        	let loc = this.expression.generateExpression(statement.expression);
			
			console.log(`generating variable declaration for ${identifier}`);
			console.log(loc);
			console.log(statement.dataType);

        	//Add variable to function scope
	        this.scope.addVariable({
				name: identifier,
				loc,
				dataType: statement.dataType
			});
		} else {
			if (statement.dataType.isArray) {
				if (!statement.dataType.arraySize) throw new Error.Generator(`Cannot leave array uninitialized without providing array size.`, statement.bracketStart);
				
				let loc = this.memory.allocateArrayBSS(statement.identifier.value, statement.dataType);

				//Add variable to function scope
				this.scope.addVariable({
					name: statement.identifier.value,
					dataType: statement.dataType,
					loc
				});
			} else {
				throw "Compiler does not currently supporting declaring variables without initialization";
			}
		}

		//Ensure register isn't storing a value unfit for the data type 
        //this.sizeRegisterToDataType(register, dataType); 
    }

	generateReturnStatement(statement) {
		console.log(this.scope.getVariable("string"));
    	let loc = this.expression.generateExpression(statement.expression);
		
		if (this.assembly.currentFunctionIdentifier == "main") {
			//Since this is the main function, the return value should be used as an exit code
			//This uses a Linux syscall which isn't ideal but is useful for short-term testing
			this.assembly.addInstruction(`mov rax, 60`);
			console.log("returning");
			console.log(loc);
			this.memory.moveLocationIntoRegister("rdi", loc);
			this.assembly.addInstruction(`syscall`);
		} else {
    		this.memory.moveLocationIntoRegister("rax", loc); //rax is the designated return register
			this.memory.freeRegister(loc);
		
			this.assembly.addInstruction(`pop rbp`); //Restore old base pointer
		
			let argumentBytes = 16 * this.assembly.currentFunction.parameters.length;
			this.assembly.addInstruction(`ret ${argumentBytes}`); //Ignore the part of the stack used for arguments
		}
	}
	
	generateIfStatement(statement) {
		let loc = this.expression.generateExpression(statement.expression);
	
		//Label that if jumped to, will skip the if block
		let skipLabel = this.assembly.generateLabel();

		let register = this.memory.moveLocationIntoARegister(loc);
		this.assembly.addInstruction(`cmp ${register}, 1`);
		this.assembly.addInstruction(`jne ${skipLabel}`);
		this.generateBlock(statement.block);
		this.assembly.addInstruction(`${skipLabel}:`);
	}
}

module.exports = StatementGenerator;
