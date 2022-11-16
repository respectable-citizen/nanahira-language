
class Scope {
	constructor() {
		this.members = {};
	
		this.currentScopePath = [];
	}

	getLocalScope() {
		return this.getScopeItem(this.currentScopePath);
	}
	
	getScopeItem(path) {
		let item = this.members;
		for (let pathItem of path) item = item[pathItem];

		return item;
	}

	addScopeItem(path, name, value) {
		this.getScopeItem(path)[name] = value;
	}

	addLocalScopeItem(name, value) {
		this.getLocalScope()[name] = value;
	}

	getLocalScopeItem(name) {
		let localScope = this.getLocalScope();
		
		if (localScope[name]) return localScope[name];
		return null;
	}

	descendScope(name) {
		if (!this.getLocalScopeItem(name)) throw `Attempt to descend into scope "${name}" from path "${this.currentScopePath.join(",")}" but it does not exist`;
		this.currentScopePath.push(name);
	}

	ascendScope() {
		this.currentScopePath.pop();
	}

	getDataType(name) {
		let item = this.getScopeItem([])[name];
		if (item && item.type == "dataType") return item;
	}

	getFunction(name) {
		let item = this.getScopeItem([])[name];
		if (item && item.type == "function") return item;
	}

	getVariable(name) {
		let item = this.members;
		for (let pathItem of this.currentScopePath) {
			if (item["variables"]) break;
			item = item[pathItem];
		}
		
		return item["variables"][name];
	}

	//Gets added to global scope
	addDataType(dataType) {
		this.addScopeItem([], dataType.name, {
			type: "dataType",
			...dataType
		});
	}

	//Gets added to global scope
	addFunction(func) {
		this.addScopeItem([], func.name, {
			type: "function",
			variables: [],
			...func
		});
	}

	//Gets added to local scope
	addVariable(variable) {
		let variables = this.getLocalScopeItem("variables");
		
		variables[variable.name] = {
			type: "variable",
			...variable
		};

		return variables[variable.name];
	}

	//Cleans function in global scope
	cleanFunction(name) {
		let func = this.getFunction(name);
		func["variables"] = {};
	}
}

module.exports = Scope;
