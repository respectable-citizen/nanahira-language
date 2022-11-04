
//This class contains information for both the label and the instructions marked by the label.
class Label {
    constructor(name, instructions = []) {
        this.name = name;
        this.instructions = instructions;
    }
}

class Section {
    constructor(name, labels = []) {
        this.name = name;
        this.labels = labels;
    }

	getLabelOutput(label) {
		if (this.name == "text") {
        	return `${label.name}:
${label.instructions.join("\n")}`;
		} else {
			return `${label.name}: ${label.instructions}`;
		}
    }

    getAllLabelOutput() {
        let labelOutput = this.labels.map(label => this.getLabelOutput(label));
        return labelOutput.join("\n");
    }

    output() {
        return `section .${this.name}
${this.getAllLabelOutput()}`;
    }
}

class Assembly {
    constructor(scope) {
		this.scope = scope;

        this.data = new Section("data");
        this.text = new Section("text");
        this.bss = new Section("bss");

        this.instructions = []; //Buffer for storing instructions.
	}

	startFunction(identifier) {
		this.currentFunctionIdentifier = identifier;
        
		this.scope.addFunction({
			name: identifier
		});
		this.scope.descendScope(identifier);
	}
	
	addInstruction(instruction) {
		this.instructions.push(instruction);
	}
	
	finishFunction() {
        this.scope.cleanFunction(this.currentFunctionIdentifier);

        this.text.labels.push(new Label(this.currentFunctionIdentifier, this.instructions));
		this.instructions = [];
	}

	addDataEntry(name, size, value) {
		this.data.labels.push(new Label(name, `${size} ${value}`));
	}

    output() {
        return `global main

${this.data.output()}

${this.bss.output()}

${this.text.output()}`;
    }
}

module.exports = {
    Label,
    Section,
    Assembly
};
