const Nodes = require("../parser/nodes");
const Types = require("./types");
const Error = require("../error");
const Location = require("./location");

const Lexer = require("../lexer");
const Parser = require("../parser");

const Scope = require("./scope");

const Assembly = require("./assembly").Assembly;
const Memory = require("./memory");
const AST = require("./ast");

const StatementGenerator = require("./statement");

//TODO: Fully implement data types
class CodeGenerator {
    constructor(ast, files) {
        this.scope = new Scope();
        this.assembly = new Assembly(this.scope);
		this.memory = new Memory(this.scope, this.assembly);
		this.ast = new AST(ast);
		this.files = files;

		this.statement = new StatementGenerator(this.scope, this.assembly, this.memory, this.ast);

        //Add primitive data types
        for (let dataType of Types) {
            this.scope.addDataType(dataType);
        }
    }

    generateFunction(func) {
		this.memory.freeAllRegisters(); //Registers are caller-saved so we can safely use all registers

		this.assembly.startFunction(func);
		this.assembly.makeGlobal(func.identifier.value); //All functions are accessible from every file, probably a bad idea but works for now

		if (func.identifier.value == "asm") throw new Error.Generator(`Function name "asm" is reserved`, func.identifier.start);

		//Check if function should be returning something
		if (this.assembly.currentFunction.returnType.identifier.value != "void") {
			//TODO: More comprehensive return checking, this does not check for return statements in loops, conditionals, etc
			let returnStatements = this.assembly.currentFunction.block.filter(statement => statement.type == Nodes.RETURN_STATEMENT);
			if (returnStatements.length == 0) throw new Error.Generator(`Function "${func.identifier.value}" does not return any value but has non-void return type "${func.returnType.identifier.value}"`, this.assembly.currentFunction.returnType.start);
		}

		//TODO: Check if function tries to return but has void return type

		this.assembly.addInstruction(`push rbp`); //Save old base pointer to the stack
		this.assembly.addInstruction(`mov rbp, rsp`); //Use current stack pointer as new base pointer

		//Handle parameters
		for (let parameterIndex = this.assembly.currentFunction.parameters.length - 1; parameterIndex >= 0; parameterIndex--) {
			let parameter = this.assembly.currentFunction.parameters[parameterIndex];

			let baseOffset = 16 + (8 * parameterIndex); //Plus 16 to skip old base pointer and return address. 8 because function arguments are currently passed as 64-bits (8 bytes) no matter the data type
			let argumentStackLocation = Location.Stack(baseOffset, "uint64"); //Parameters are passed on the stack as 64 bits
			let argumentLocation = this.memory.moveLocationIntoARegister(argumentStackLocation, false, true); //Move argument from stack into a register, force = false, dereference = true
			argumentLocation.dataType = parameter.dataType;

			this.scope.addVariable({
				name: parameter.identifier.value,
				loc: argumentLocation
			});
		}

        this.statement.generateBlock(this.assembly.currentFunction.block);
	
		this.assembly.finishFunction();
    }	

	handleImports(imports) {
		for (let currentImport of imports) {
			let fileName = `${currentImport.identifier.value}.txt`;
			let file = this.files[fileName];
			
			for (let declaration of file.ast.declarations) {
				declaration.external = true;
				if (declaration.type == Nodes.FUNCTION_DECLARATION) this.scope.addFunction(declaration);
			}
		}
	}

    run() {
        //if (!this.ast.getFunctionNode("main")) throw "Missing main function.";
		this.handleImports(this.ast.tree.imports);

        for (let func of this.ast.functions) {
			this.statement.handleError(this.generateFunction, func, this, () => {
				this.assembly.finishFunction.call(this.assembly); //If error occurs we must execute finishFunction to prevent scope-related errors
			});
		}
		
		this.output = this.assembly.output();
    }
}

module.exports = CodeGenerator;
