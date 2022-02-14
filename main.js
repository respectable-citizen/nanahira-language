const Lexer = require("./lexer");
const Parser = require("./parser");
const Optimizer = require("./optimizer");
const CodeGenerator = require("./code_generator");

const fs = require("fs");

const data = fs.readFileSync("./input.txt", {encoding: "utf8", flag: "r"});

let lexer = new Lexer(data);
lexer.run();

let parser = new Parser(data, lexer.tokens);
parser.run();

let optimizer = new Optimizer(parser.ast);
optimizer.run();

console.log(optimizer.ast[0].block)

let code_generator = new CodeGenerator(parser.ast);
code_generator.run();

console.log(code_generator.output);
