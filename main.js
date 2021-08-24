const Lexer = require("./lexer");
const Parser = require("./parser");

const fs = require("fs");

const data = fs.readFileSync("./input.txt", {encoding: "utf8", flag: "r"});
let lexer = new Lexer(data);
lexer.run();
console.log(lexer.tokens);

let parser = new Parser(data, lexer.tokens);
parser.run();
console.log(JSON.stringify(parser.ast));