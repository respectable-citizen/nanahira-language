const Tokens = require("../lexer/tokens");
const Nodes = require("../parser/nodes");
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
            //"rax": true,  Reserved for div instruction
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
    
    getVariable(identifier) {
        let variable = this.getCurrentFunction().getVariable(identifier);
        if (variable) return variable;
        
        throw `No such variable ${expression.value.value}`;
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

        let register = this.generateExpression(statement.expression);
        this.getCurrentFunction().addVariable(identifier, {
            type: "register",
            loc: register
        }, dataType);
    }

    generateExpression(expression) {
        if (expression.type == Nodes.INTEGER_LITERAL) {
            let register = this.allocateRegister();
            this.addInstruction(`mov ${register}, ${expression.value}`);
            
            return register;
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
                return leftRegister;
            } else if (expression.operator == Tokens.MINUS) {
                this.addInstruction(`sub ${leftRegister}, ${rightRegister}`);

                this.freeRegister(rightRegister);
                return leftRegister;
            } else if (expression.operator == Tokens.STAR) {
                this.addInstruction(`imul ${leftRegister}, ${rightRegister}`);

                this.freeRegister(rightRegister);
                return leftRegister;
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

                return "rax";
            }

            throw "Unknown operator.";
        } else if (expression.type == Nodes.VARIABLE) {
            let variable = this.getVariable(expression.value.value);

            if (variable.loc.type == "register") return variable.loc.loc;
        }
        
        throw "Unknown expression type.";
    }

    generateAssignmentExpression(statement) {
        let variable = this.getVariable(statement.identifier.value);
        if (variable.loc.type == "register") {
            let expressionValueRegister 

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

        }
    }

    generateReturnStatement(statement) {
        //console.log(statement)
    }

    generateBlock(block) {
        for (let statement of block) {
            if (statement.type == Nodes.VARIABLE_DECLARATION) {
                this.generateVariableDeclaration(statement);
            } else if (statement.type == Nodes.RETURN_STATEMENT) {
                this.generateReturnStatement(statement);
            } else if (statement.type == Nodes.ASSIGNMENT_EXPRESSION) {
                this.generateAssignmentExpression(statement);
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
