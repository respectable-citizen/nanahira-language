const Nodes = require("../parser/nodes");

class AST {
	constructor(tree) {
		this.tree = tree;
        
		this.functions = this.tree.declarations.filter(node => node.type == Nodes.FUNCTION_DECLARATION);
	}

	getFunctionNode(identifier) {
		return this.functions.filter(node => node.identifier.value == identifier)[0];
	}
}

module.exports = AST;
