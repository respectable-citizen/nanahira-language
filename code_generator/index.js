const Nodes = require("../parser/nodes");
const Types = require("./types");
const Error = require("../error");

const Scope = require("./scope");

const Assembly = require("./assembly").Assembly;
const Memory = require("./memory");

const StatementGenerator = require("./statement");

//TODO: Fully implement data types
class CodeGenerator {
    constructor(ast) {
        this.scope = new Scope();
        this.assembly = new Assembly(this.scope);
		this.memory = new Memory(this.assembly);

		this.statement = new StatementGenerator(this.scope, this.assembly, this.memory);

        this.ast = ast;
        this.functions = this.ast.filter(node => node.type == Nodes.FUNCTION_DECLARATION);

        //Add primitive data types
        for (let dataType of Types) {
            this.scope.addDataType(dataType);
        }
    }

	getFunctionNode(identifier) {
		return this.functions.filter(node => node.identifier.value == identifier)[0];
	}

    generateFunction(func) {
		this.assembly.currentFunction = func;
		this.assembly.startFunction(func.identifier.value);

		if (func.identifier.value == "asm") throw new Error.Generator(`Function name "asm" is reserved`, func.identifier.start);
		if (func.identifier.value == "syscall") throw new Error.Generator(`Function name "syscall" is reserved`, func.identifier.start);

		//Check if function should be returning something
		if (this.assembly.currentFunction.returnType.value != "void") {
			//TODO: More comprehensive return checking, this does not check for return statements in loops, conditionals, etc
			let returnStatements = this.assembly.currentFunction.block.filter(statement => statement.type == Nodes.RETURN_STATEMENT);
			if (returnStatements.length == 0) throw new Error.Generator(`Function "${func.identifier.value}" does not return any value but has non-void return type "${func.returnType.value}"`, this.assembly.currentFunction.returnType.start);
		}

		//TODO: Check if function tries to return but has void return type

		this.assembly.addInstruction(`push rbp`); //Save old base pointer to the stack
		this.assembly.addInstruction(`mov rbp, rsp`); //Use current stack pointer as new base pointer

		//Handle parameters
		for (let parameterIndex = this.assembly.currentFunction.parameters.length - 1; parameterIndex >= 0; parameterIndex--) {
			let parameter = this.assembly.currentFunction.parameters[parameterIndex];

			let register = this.memory.allocateRegister();

			let baseOffset = 16 + (16 * parameterIndex); //Plus 16 to skip old base pointer and return address
			this.assembly.addInstruction(`mov ${register}, [rbp + ${baseOffset}]`); //Move argument from stack into register
		
			this.scope.addVariable(parameter.identifier.value, {
				type: "register",
				loc: register
			}, parameter.dataType.value);
		}

        this.statement.generateBlock(this.assembly.currentFunction.block);
	
		this.assembly.finishFunction();
    }	

    run() {
        if (!this.getFunctionNode("main")) throw "Missing main function.";

        for (let func of this.functions) this.statement.handleError(this.generateFunction, func, this);
		
		this.output = this.assembly.output();
    }
}

module.exports = CodeGenerator;
