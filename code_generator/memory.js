
//Manages usage of data segments (data, rodata, bss), stack, heap, and registers
class Memory {
	constructor(assembly) {
		this.assembly = assembly;

        this.registers = {
            //"rax": true,  Reserved for div instruction and returning up to 64 bits from functions
            "rbx": true,
            "rcx": true,
            //"rdx": true,  Reserved for div instruction
            //"rbp": true,  Reserved for stack
            //"rsp": true,  Reserved for stack
            "rsi": true,
            "rdi": true,
            "r8":  true,
            "r9":  true,
            "r10":  true,
            "r11":  true,
            "r12":  true,
            "r13":  true,
            "r14":  true,
            "r15":  true,
        };
	}

	//Returns size in bits of a given data type
	getSizeFromDataType(dataType) {
		if (dataType == "uint8" || dataType == "int8") return 8;
		if (dataType == "uint16" || dataType == "int16") return 16;
		if (dataType == "uint32" || dataType == "int32") return 32;
		if (dataType == "uint64" || dataType == "int64") return 64;

		throw `Cannot determine size of data type "${dataType}"`;
	}

	//Generates corresponding assembly code that retrieves data from its location (registers/memory/stack)
	retrieveFromLocation(loc) {
		if (loc.type == "register") return loc.loc;
		else if (loc.type == "memory") {
			let variable = this.getCurrentFunction().getVariable(loc.loc);
			let bytesPerElement = this.getSizeFromDataType(variable.dataType) / 8;
			
			let memoryOffset = "";
			if (loc.index) memoryOffset = ` + ${loc.index * bytesPerElement}`;

			return `[${loc.loc}${memoryOffset}]`;
		} else if (loc.type == "stack") {
			let memoryOffset = "";
			if (loc.baseOffset) memoryOffset = ` - ${Math.abs(loc.baseOffset)}`;

			return `[rbp${memoryOffset}]`;
		} else {
			throw `Cannot handle location type ${loc.type}`;
		}
	}

	//Moves location into a specific register
	moveLocationIntoRegister(register, loc) {
		loc = this.retrieveFromLocation(loc);
		this.assembly.addInstruction(`lea ${register}, ${loc}`);
	}

	//Moves location into a newly allocated register and returns the register, if the location is already a register nothing will happen
	moveLocationIntoARegister(loc) {
		if (loc.type == "register") return loc.loc;

		let register = this.allocateRegister();
		this.moveLocationIntoRegister(register, loc);

		return register
	}

	allocateRegister() {
        for (let register in this.registers) {
            if (this.registers[register]) {
                this.registers[register] = false;
                return register;
            }
        }

        throw "Ran out of registers to allocate.";
    }

    freeRegister(register) {
        this.registers[register] = true;
    }

	allocateData(name, size, values) {
		this.assembly.addDataEntry(name, size, values.join(", "));
	}

	/*allocateArray(name, arrayDataType, values) {
		//Convert data type into assembly declare (db, dw, dd, dq)
		let dataTypeSizeBits = this.getSizeFromDataType(arrayDataType);
		let assemblyDeclareSize;
		if (dataTypeSizeBits == 8) assemblyDeclareSize = "db";
		else if (dataTypeSizeBits == 16) assemblyDeclareSize = "dw";
		else if (dataTypeSizeBits == 32) assemblyDeclareSize = "dd";
		else if (dataTypeSizeBits == 64) assemblyDeclareSize = "dq";
			
		if (!assemblyDeclareSize) throw `Unable to reserve size of ${dataTypeSizeBits} bits`;
	
		//Insert the array into the data section
		this.allocateData(name, assemblyDeclareSize, values);
		
		//Return location of allocated memory
		return {
			type: "memory",
			loc: name
		};
	}*/

	//Allocates array on the stack
	allocateArrayStack(name, arrayDataType, values) {
		let dataTypeSizeBits = this.getSizeFromDataType(arrayDataType);
		let arraySizeBytes = (dataTypeSizeBits / 8) * values.length;

		//Determine operation size
		let operationSize;
		if (dataTypeSizeBits == 8) operationSize = "byte";
		else if (dataTypeSizeBits == 16) operationSize = "word";
		else if (dataTypeSizeBits == 32) operationSize = "dword";
		else if (dataTypeSizeBits == 64) operationSize = "qword";
			
		if (!operationSize) throw `Unable to reserve size of ${dataTypeSizeBits} bits`;
	

		//Allocate required bytes on the stack
		this.assembly.moveStackPointer(-arraySizeBytes);

		//Move data into allocated space
		for (let i = 0; i < values.length; i++) {
			let offset = "";
			if (i) offset = ` + ${i}`;

			this.assembly.addInstruction(`mov ${operationSize} [rsp${offset}], ${values[i]}`);
		}

		return {
			type: "stack",
			baseOffset: this.assembly.stackPointerOffset
		};
	}
}

module.exports = Memory;
