const Lexer = require("./lexer");
const Parser = require("./parser");
const Optimizer = require("./optimizer");
const CodeGenerator = require("./code_generator");

const Error = require("./error");

const fs = require("fs");

const data = fs.readFileSync("./input.txt", {encoding: "utf8", flag: "r"});

Error.setSource(data);

let lexer = new Lexer(data);
lexer.run();

let parser = new Parser(data, lexer.tokens);
parser.run();

let optimizer = new Optimizer(parser.ast);
optimizer.run();

let code_generator = new CodeGenerator(parser.ast);
code_generator.run();

if (!Error.hasGenerationErrorOccurred()) console.log(code_generator.output);
