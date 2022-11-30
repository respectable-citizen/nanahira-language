const Nodes = require("../parser/nodes");

class AST {
	constructor(tree) {
		this.tree = tree;
        
		this.classes = this.tree.declarations.filter(node => node.type == Nodes.CLASS_DECLARATION);
		this.functions = this.tree.declarations.filter(node => node.type == Nodes.FUNCTION_DECLARATION);
		this.variables = this.tree.declarations.filter(node => node.type == Nodes.VARIABLE_DECLARATION);
	}

	getFunctionNode(identifier) {
		return this.functions.filter(node => node.identifier.value == identifier)[0];
	}
}

module.exports = AST;
