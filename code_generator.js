const Tokens = require("./tokens");
const Nodes = require("./nodes");

const {Label, Section, Assembly} = require("./assembly");

class CodeGenerator {
    constructor(ast) {
        this.assembly = new Assembly();
        this.ast = ast;
        this.functions = this.ast.filter(node => node.type == Nodes.FUNCTION_DECLARATION);
    }

    getFunction(identifier) {
        return this.functions.filter(node => node.identifier.value == identifier)[0];
    }

    generateFunction(identifier) {
        let func = this.getFunction(identifier);
        let instructions = this.generateBlock(func.block);
        
        this.assembly.text.labels.push(new Label(identifier, instructions));
    }

    generateAssignmentExpression(statement) {
        console.log(statement)
        return [];
    }

    generateBlock(block) {
        let instructions = [];
        for (let statement of block) {
            let gen = []; //Used to stored instructions generated each iteration, appended to main instructions array after each iteration

            if (statement.type == Nodes.ASSIGNMENT_EXPRESSION) {
                gen = this.generateAssignmentExpression(statement);
            }

            instructions = instructions.concat(gen);
        }
        return instructions;
    }

    run() {
        if (!this.getFunction("main")) throw "Missing main function.";

        this.generateFunction("main");
        this.output = this.assembly.output();
    }
}

module.exports = CodeGenerator;