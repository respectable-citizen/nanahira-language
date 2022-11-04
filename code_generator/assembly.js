
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
    constructor() {
        this.data = new Section("data");
        this.text = new Section("text");
        this.bss = new Section("bss");
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
