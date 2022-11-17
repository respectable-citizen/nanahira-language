
class Error {
	source;
	generationErrorOccurred = false;

	setSource(_source) {
		this.source = _source;
	}

	static Generator(message, arrow = null) {
		this.name = "CodeGeneratorError";
		this.message = message;
		this.arrow = arrow;
	}

	reportError(lineNumber, line, message, arrow = null) {
		console.log(`ERROR at line ${lineNumber}!`);
		console.log(line);
		if (arrow !== null) console.log(this.generateArrowAtPosition(arrow));
		console.log("");
		console.log(`Error: ${message}`);
		console.log("");
		console.log("");
	}

	generateArrowAtPosition(position) {
		return " ".repeat(position) + "^";
	}

	getPositionFromNode(node, position = {}) {
		if (typeof node != "object") return position;
	
		if (node.line) position.line = node.line;
		if (node.start && (node.start <= position.start || !position.start)) position.start = node.start;
		if (node.end && (node.end >= position.end || !position.end)) position.end = node.end;
	
		for (let key of Object.keys(node)) {
			position = this.getPositionFromNode(node[key], position);
		}
	
		return position;
	}

	error(message, node, arrow = null) {
		//let position = getPositionFromNode(node);
		
		let line = source.substring(node.start, node.end);
		this.reportError(node.line, line, message, arrow ? arrow - node.start : null);
	
		generationErrorOccurred = true;
	}
}

module.exports = Error;
