
//This class is called label, but it contains information for both the label and the instructions marked by the label.
class Label {
    constructor(name, instructions = []) {
        this.name = name;
        this.instructions = instructions;
    }

    output() {
        return `${this.name}:
${this.instructions.join("\n")}`;
    }
}

class Section {
    constructor(name, labels = []) {
        this.name = name;
        this.labels = labels;
    }

    getAllLabelOutput() {
        let labelOutput = this.labels.map(label => label.output());
        return labelOutput.join("\n");
    }

    output() {
        return `section .${this.name}
${this.getAllLabelOutput()}`;
    }
}

class Assembly {
    constructor() {
        this.text = new Section("text");
        this.data = new Section("data");
    }

    output() {
        return `global _main

${this.text.output()}

${this.data.output()}`;
    }
}

module.exports = {
    Label,
    Section,
    Assembly
};