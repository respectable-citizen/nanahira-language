
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

        this.instructions = [];      //Buffer for storing instructions.

		this.stackPointerOffset = 0; //How much has the stack pointer moved since we started generating the current function (rsp - rbp)
	}

	startFunction(identifier) {
		this.stackPointerOffset = 0;
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

	moveStackPointer(amount) {
		this.stackPointerOffset += amount;
		
		if (amount >= 0) {
			this.addInstruction(`add rsp, ${amount}`);
		} else {
			this.addInstruction(`sub rsp, ${Math.abs(amount)}`);
		}
	}

	generateLabel() {
		const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
		const charactersLength = characters.length;

		let label = "";
		for (let i = 0; i < 10; i++) {
			label += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		
		return label;
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
