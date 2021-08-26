//Scopes be scopes, or members of scopes. For example, a variable is not a scope itself but it is contained within a scope and therefore has a class "VariableScope".
class GlobalScope {
    constructor(members = {}) {
        this.members = members;
    }

    addScopeItem(identifier, scopeItem) {
        this.members[identifier] = scopeItem;
    }

    getScopeItem(identifier) {
        return this.members[identifier];
    }

    getScopeItemWithType(identifier, type) {
        let scopeItem = this.getScopeItem(identifier);
        if (!scopeItem) return;
        if (!(scopeItem instanceof type)) return;

        return scopeItem;
    }

    addFunction(identifier, returnType, variables = {}) {
        let func = new FunctionScope(returnType, variables);
        this.addScopeItem(identifier, func);
    }
    
    addDataType(identifier) {
        let dataType = new DataTypeScope();
        this.addScopeItem(identifier, dataType);
    }

    getFunction(identifier) {
        return this.getScopeItemWithType(identifier, FunctionScope);
    }

    getDataType(identifier) {
        return this.getScopeItemWithType(identifier, DataTypeScope);
    }

    //Cleans up a function to save some memory
    cleanFunction(identifier) {
        let func = this.getFunction(identifier);
        func.variables = []; //We don't need the variables anymore as they were only used for semantic analysis within the scope
    }
}

class FunctionScope {
    constructor(returnType, variables = {}) {
        this.returnType = returnType;
        this.variables = variables;
    }

    addVariable(identifier, returnType) {
        this.variables[identifier] = new VariableScope(returnType);
    }

    getVariable(identifier) {
        return this.variables[identifier];
    }
}

class VariableScope {
    constructor(dataType) {
        this.dataType = dataType;
    }
}

class DataTypeScope {
    constructor() {}
}

module.exports = {
    GlobalScope,
    FunctionScope,
    VariableScope,
    DataTypeScope
};