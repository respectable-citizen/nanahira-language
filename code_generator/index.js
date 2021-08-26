const Tokens = require("../tokens");
const Nodes = require("../nodes");
const Types = require("./types");

const {GlobalScope, FunctionScope, VariableScope, DataTypeScope} = require("./scope");

const {Label, Section, Assembly} = require("./assembly");

//TODO: Fully implement data types
//TODO: Make error messages not crap: they need to provide an indication of where the error is occurring
class CodeGenerator {
    constructor(ast) {
        this.assembly = new Assembly();
        this.ast = ast;
        this.functions = this.ast.filter(node => node.type == Nodes.FUNCTION_DECLARATION);

        this.instructions = []; //Buffer for storing instructions.

        this.registers = {
            "rax": 1,
            "rbx": 1,
            "rcx": 1,
            "rdx": 1,
            "rsi": 1,
            "rdi": 1
        };

        this.currentFunc; //Stores the current function that is being parsed.
        this.scope = new GlobalScope(); //Stores scope information for semantic analysis and such

        //Add primitive data types
        for (let type in Types) {
            this.scope.addDataType(type);
        }
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
                this.registers[register] = 0;
                return register;
            }
        }

        throw "Ran out of registers to allocate.";
    }

    freeRegister(register) {
        this.registers[register] = 1;
    }

    performRAXInstruction(leftRegister, rightRegister, mnemonic) {}

    getFunction(identifier) {
        return this.functions.filter(node => node.identifier.value == identifier)[0];
    }

    generateFunction(identifier) {
        let func = this.getFunction(identifier);
        this.currentFunc = identifier; //Set the current function being parsed

        this.scope.addFunction(identifier, func.returnType.value); //Create a scope entry
        let instructions = this.generateBlock(func.block);
        this.scope.cleanFunction(identifier);                      //We are done parsing the function, clean it up

        this.assembly.text.labels.push(new Label(identifier, instructions));
    }

    generateVariableDeclaration(statement) {
        let identifier = statement.identifier.value;

        if (this.getCurrentFunction().getVariable(identifier)) {
            throw "Variable has already been declared.";
        }

        let dataType = statement.dataType.value;
        if (!this.scope.getDataType(dataType)) throw `Data type ${dataType} does not exist.`;

        this.getCurrentFunction().addVariable(identifier, dataType);

        return this.generateExpression(statement.expression);
    }

    generateExpression(expression) {
        if (expression.type == Nodes.INTEGER_LITERAL) {
            let register = this.allocateRegister();
            this.addInstruction(`mov ${register}, ${expression.value}`);
            
            return register;
        } else if (expression.type == Nodes.BINARY_EXPRESSION) {
            let leftRegister = this.generateExpression(expression.left);
            let rightRegister = this.generateExpression(expression.right);

            if (expression.operator == Tokens.PLUS) {
                this.addInstruction(`add ${leftRegister}, ${rightRegister}`);

                this.freeRegister(rightRegister);
                return leftRegister;
            } else if (expression.operator == Tokens.MINUS) {
                this.addInstruction(`sub ${leftRegister}, ${rightRegister}`);

                this.freeRegister(rightRegister);
                return leftRegister;
            }/* else if (expression.operator == Tokens.STAR) {
                return this.performRAXInstruction(leftRegister, rightRegister, "mul");
            } else if (expression.operator == Tokens.SLASH) {
                return this.performRAXInstruction(leftRegister, rightRegister, "div");
            }*/

            throw "Unknown operator.";
        }
        
        throw "Unknown expression type.";
    }

    generateReturnStatement(statement) {
        //console.log(statement)
    }

    generateBlock(block) {
        for (let statement of block) {
            if (statement.type == Nodes.VARIABLE_DECLARATION) {
                console.log(this.generateVariableDeclaration(statement));
            } else if (statement.type == Nodes.RETURN_STATEMENT) {
                this.generateReturnStatement(statement);
            }
        }

        return this.getInstructions();
    }

    run() {
        if (!this.getFunction("main")) throw "Missing main function.";

        this.generateFunction("main");
        this.output = this.assembly.output();
    }
}

module.exports = CodeGenerator;
