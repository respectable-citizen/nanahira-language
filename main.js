const Lexer = require("./lexer");
const Parser = require("./parser");
const Optimizer = require("./optimizer");
const CodeGenerator = require("./code_generator");

const Error = require("./error");

const fs = require("fs");

if (!fs.existsSync("source")) fs.mkdirSync("source");
if (!fs.existsSync("output")) fs.mkdirSync("output");

//Parse each file before generating code, we need to do this because we don't use header files like C/C++
let files = {};
fs.readdirSync("source").forEach(file => {
	if (!file.endsWith(".txt")) return;

	const data = fs.readFileSync(`source/${file}`, {encoding: "utf8", flag: "r"});

	let error = new Error.Error();
	error.setSource(data);

	let lexer = new Lexer(data);
	lexer.run();

	let parser = new Parser(data, error, lexer.tokens);
	parser.run();

	files[file] = {
		file,
		error,
		ast: parser.ast
	};
});

for (let fileName in files) {
	let file = files[fileName];
	
	let optimizer = new Optimizer(file.ast);
	optimizer.run();

	let code_generator = new CodeGenerator(file.ast, files, file.error);
	code_generator.run();

	if (!file.error.generationErrorOccurred) {
		let outfile = fileName.replace(".txt", ".s");
		fs.writeFileSync(`output/${outfile}`, code_generator.output);
	}
}
