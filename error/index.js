
let source;
let generationErrorOccurred = false;

function setSource(_source) {
	source = _source;
}

function Generator(message, arrow = null) {
	this.name = "CodeGeneratorError";
	this.message = message;
	this.arrow = arrow;
}

function reportError(lineNumber, line, message, arrow = null) {
	console.log(`ERROR at line ${lineNumber}!`);
	console.log(line);
	if (arrow !== null) console.log(generateArrowAtPosition(arrow));
	console.log("");
	console.log(`Error: ${message}`);
	console.log("");
	console.log("");
}

function generateArrowAtPosition(position) {
	return " ".repeat(position) + "^";
}

function getPositionFromNode(node, position = {}) {
	if (typeof node != "object") return position;

	if (node.line) position.line = node.line;
	if (node.start && (node.start <= position.start || !position.start)) position.start = node.start;
	if (node.end && (node.end >= position.end || !position.end)) position.end = node.end;

	for (let key of Object.keys(node)) {
		position = getPositionFromNode(node[key], position);
	}

	return position;
}

function error(message, node, arrow = null) {
	//let position = getPositionFromNode(node);
	
	let line = source.substring(node.start, node.end);
	reportError(node.line, line, message, arrow ? arrow - node.start : null);

	generationErrorOccurred = true;
}

module.exports = {
	setSource,
	hasGenerationErrorOccurred: () => { return generationErrorOccurred },
	Generator,
	
	//Used by the parser
	reportError,
	
	//Used by the code generator
	error
};
