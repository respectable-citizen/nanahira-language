const Location = require("./location");

//Manages usage of data segments (data, rodata, bss), stack, heap, and registers
class Memory {
	constructor(scope, assembly) {
		this.scope = scope;
		this.assembly = assembly;

        this.registers = {
            //"a": true,  Reserved for div and returning up to 64 bits from functions
            //"b": true,  Reserved for effective addressing
            "c": true,
            //"d": true,  Reserved for div instruction
            //"bp": true,  Reserved for stack
            //"sp": true,  Reserved for stack
            "si": true,
            "di": true,
            "8":  true,
            "9":  true,
            "10":  true,
            "11":  true,
            "12":  true,
            "13":  true,
            "14":  true,
            "15":  true,
        };
	}

	dataTypeToText(dataType) {
		return dataType.identifier.value + "*".repeat(dataType.pointer ? dataType.pointer : (dataType.isArray ? 1 : 0));
	}

	getOperationSize(dataType) {
		let dataTypeSizeBits = this.getSizeOfDataTypeElement(dataType);
		
		let operationSize;
		if (dataTypeSizeBits == 8) operationSize = "byte";
		else if (dataTypeSizeBits == 16) operationSize = "word";
		else if (dataTypeSizeBits == 32) operationSize = "dword";
		else if (dataTypeSizeBits == 64) operationSize = "qword";
			
		if (!operationSize) throw `Unable to reserve size of ${dataTypeSizeBits} bits`;

		return operationSize;
	}

	//Returns data type of required bit width to fit integer
	decideIntegerDataType(value) {
		if (value < 0) throw "Function does not currently support negative numbers.";
		if (value < 2 ** 8) return "uint8";
		if (value < 2 ** 16) return "uint16";
		if (value < 2 ** 32) return "uint32";
		if (value < 2 ** 64) return "uint64";

		throw `No appropriate data type to store integer ${value.toString()}`;
	}

	//Converts location containing register and data type to register name
	//Example: register di and 8-bit data type -> dil
	locationToRegisterName(loc) {
		if (loc.type != "register") throw "Location type is not register.";

		let dataTypeSizeBits = this.getSizeOfDataType(loc.dataType);
		if (dataTypeSizeBits != 8 && dataTypeSizeBits != 16 && dataTypeSizeBits != 32 && dataTypeSizeBits != 64) throw "Data type can not fit exactly in a register.";

		if (loc.loc == "a" || loc.loc == "b" || loc.loc == "c" || loc.loc == "d") {
			if (dataTypeSizeBits == 8) {
				return loc.loc + "l";
			} else if (dataTypeSizeBits == 16) {
				return loc.loc + "x";
			} else if (dataTypeSizeBits == 32) {
				return "e" + loc.loc + "x";
			} else if (dataTypeSizeBits == 64) {
				return "r" + loc.loc + "x";
			}
		} else if (loc.loc == "si" || loc.loc == "di" || loc.loc == "bp" || loc.loc == "sp") {	//Returns data type of required bit width to fit integer
			if (dataTypeSizeBits == 8) {
				return loc.loc + "l";
			} else if (dataTypeSizeBits == 16) {
				return loc.loc;
			} else if (dataTypeSizeBits == 32) {
				return "e" + loc.loc;
			} else if (dataTypeSizeBits == 64) {
				return "r" + loc.loc;
			}
		} else {
			if (dataTypeSizeBits == 8) {
				return "r" + loc.loc + "b";
			} else if (dataTypeSizeBits == 16) {
				return "r" + loc.loc + "w";
			} else if (dataTypeSizeBits == 32) {
				return "r" + loc.loc + "d";
			} else if (dataTypeSizeBits == 64) {
				return "r" + loc.loc;	
			}
		}

		throw "Could not convert location to register name.";
	}

	//If types can be implicitly casted, currentDataType will be changed and function will return true
	//Otherwise returns false
	implicitlyTypecast(requiredDataType, currentDataType) {
		requiredDataType.pointer = requiredDataType.pointer ? requiredDataType.pointer : 0;
		currentDataType.pointer = currentDataType.pointer ? currentDataType.pointer : 0;

		if (requiredDataType.identifier.value == currentDataType.identifier.value && requiredDataType.pointer == currentDataType.pointer) return true; //Types are already the same, no need to cast

		if (requiredDataType.pointer != currentDataType.pointer) return false;

		//Expression data type and variable data type do not match, can we implicitly typecast?
		let castableIntTypes = [
			"int8",
			"uint8",
			"char",

			"int16",
			"uint16",

			"int32",
			"uint32",

			"int64",
			"uint64",

			"void"
		];
		if (castableIntTypes.includes(requiredDataType.identifier.value) && castableIntTypes.includes(currentDataType.identifier.value)) {
			//Integer typecasting
			let requiredBitSize = this.getSizeOfDataTypeElement(requiredDataType);
			let currentBitSize = this.getSizeOfDataTypeElement(currentDataType);
				
			//if (requiredBitSize >= currentBitSize) return true;
		
			currentDataType.identifier.value = requiredDataType.identifier.value;
			currentDataType.pointer = requiredDataType.pointer;

			return true;
		}

		return false;
	}

	getSizeOfDataTypeElement(dataType) {
		let dataTypeScope = this.scope.getDataType(dataType.identifier.value);
		if (!dataTypeScope || dataTypeScope.size === undefined) throw `Cannot determine size of data type "${dataType}"`;
		return dataTypeScope.size;
	}

	//Returns size in bits of a given data type
	getSizeOfDataType(dataType) {
		if (dataType.isArray) return 64; //Arrays are stored as pointers so they are 64 bits
		if (dataType.pointer) return 64; //Pointers are memory addresses, so 64 bits

		return this.getSizeOfDataTypeElement(dataType);
	}

	//Generates corresponding assembly code that represents the location of some data (registers/memory/stack)
	retrieveFromLocation(loc, dereference) {
		let name;

		if (loc.type == "register") {
			loc = structuredClone(loc);
			
			let bytesPerElement = this.getSizeOfDataTypeElement(loc.dataType) / 8;
			
			let memoryOffset = "";
			if (typeof loc.index == "object") {
				loc.dataType.identifier.value = "uint64"; //Effective addressing requires use of 64 bit register names

				memoryOffset = ` + ${this.retrieveFromLocation(loc.index)} * ${bytesPerElement}`;
			} else if (loc.index !== undefined) {
				loc.dataType.identifier.value = "uint64"; //Effective addressing requires use of 64 bit register names
				
				memoryOffset = ` + ${loc.index * bytesPerElement}`;
			}
		
			name = `${this.locationToRegisterName(loc)}${memoryOffset}`;
		} else if (loc.type == "memory") {
			let bytesPerElement = this.getSizeOfDataTypeElement(loc.dataType) / 8;
			
			let memoryOffset = "";
			if (loc.index !== undefined) memoryOffset = ` + ${loc.index * bytesPerElement}`;

			name = `${loc.loc}${memoryOffset}`;
		} else if (loc.type == "stack") {
			let memoryOffset = "";
			if (typeof loc.index == "object") {
				//Index is a location instead of a simple integer so we have to handle it differently
				memoryOffset = (loc.baseOffset > 0) ? ` + ${loc.baseOffset}` : ` - ${-loc.baseOffset}`;
				memoryOffset += ` + ${this.retrieveFromLocation(loc.index)}`;
			} else {
				let totalOffset = loc.baseOffset + (loc.index ? loc.index : 0);
				if (totalOffset) memoryOffset = (totalOffset > 0) ? ` + ${totalOffset}` : ` - ${-totalOffset}`;
			}

			name = `rbp${memoryOffset}`;
		} else {
			throw `Cannot handle location type ${loc.type}`;
		}

		if (dereference || name.includes("+") || name.includes("-") || name.includes("*")) name = `[${name}]`;

		return name;
	}

	/*
	moveRegisterIntoLocation(loc, registerLocation) {
		if (registerLocation.type != "register") throw `Location type is not a register.`;

		loc = this.retrieveFromLocation(loc);
		
		this.assembly.addInstruction(`mov ${loc}, ${registerLocation.loc}`);
	}
	*/

	//Performs move on locations, not limited to just registers (stack, memory, etc)
	locationMove(destinationLocation, sourceLocation, dereference = false, zeroExtend = false) {
		let instruction;

		if (dereference) {
			instruction = "mov";
		} else {
			if (this.retrieveFromLocation(sourceLocation).startsWith("[")) {
				instruction = "lea";
			} else {
				instruction = "mov";
			}
		}
		
		if (instruction == "lea") {
			//If we are getting address rather than dereferencing, we need to use all 64 bits
			destinationLocation.dataType.identifier.value = "uint64";
		}

		let sourceSizeBits;
		let destinationSizeBits;
		
		if (dereference) {
			sourceSizeBits = this.getSizeOfDataTypeElement(sourceLocation.dataType);
			destinationSizeBits = this.getSizeOfDataTypeElement(destinationLocation.dataType);
		} else {
			sourceSizeBits = this.getSizeOfDataType(sourceLocation.dataType);
			destinationSizeBits = this.getSizeOfDataType(destinationLocation.dataType);
		}
	
		if (zeroExtend && instruction == "mov" && sourceSizeBits != 64 && destinationSizeBits > sourceSizeBits) {
			if (destinationSizeBits == 64 && sourceSizeBits == 32) {
				destinationLocation.dataType.identifier.value = "uint32";
				sourceLocation.dataType.identifier.value = "uint32";
			} else {
				instruction = "movzx";
				destinationLocation.dataType.identifier.value = "uint64";
			}
		}

		let destinationName = this.retrieveFromLocation(destinationLocation, false);
		let sourceName = this.retrieveFromLocation(sourceLocation, dereference);

		if (sourceName.startsWith("[")) sourceName = `${this.getOperationSize(sourceLocation.dataType)} ${sourceName}`;
		if (destinationName.startsWith("[")) destinationName = `${this.getOperationSize(destinationLocation.dataType)} ${destinationName}`;
		
		this.assembly.addInstruction(`${instruction} ${destinationName}, ${sourceName}`);
	}
	
	//Moves location into a specific register
	moveLocationIntoRegister(destinationRegister, sourceLocation) {
		let destinationRegisterLocation = new Location("register", destinationRegister, sourceLocation.dataType);

		this.locationMove(destinationRegisterLocation, sourceLocation);

		return destinationRegisterLocation;
	}
	
	//Moves location into a newly allocated register and returns the register, if the location is already a register nothing will happen unless force is true
	moveLocationIntoARegister(loc, force = false, dereference = false) {
		if (loc.type == "register" && !force) return loc;

		let registerLocation = new Location("register", this.allocateRegister(), {
			identifier: {value: "uint64"} //Move location into full 64 bits of register so we don't leave some of the old value in the register
		});
		this.locationMove(registerLocation, loc, dereference, true); //zeroExtend = true
		registerLocation.dataType = loc.dataType;
		
		return registerLocation;
	}

	moveIntegerIntoARegister(integer) {
		let registerLocation = new Location("register", this.allocateRegister(), {
			identifier: {value: "uint64"} //Move integer into full 64 bits of register
		});
		this.assembly.addInstruction(`mov ${this.retrieveFromLocation(registerLocation)}, ${integer.toString()}`);
		registerLocation.dataType.identifier.value = this.decideIntegerDataType(integer); //Set actual data type of integer on location

		return registerLocation;
	}

	moveCharIntoARegister(charCode) {
		let registerLocation = new Location("register", this.allocateRegister(), {
			identifier: {value: "uint64"} //Move integer into full 64 bits of register
		});
		this.assembly.addInstruction(`mov ${this.retrieveFromLocation(registerLocation)}, ${charCode.toString()}`);
		registerLocation.dataType.identifier.value = "char"; //Set actual data type of integer on location

		return registerLocation;
	}

	pushLocation(loc, updateStackPointerOffset = true, free = true) {
		let register = this.moveLocationIntoARegister(loc);
		this.assembly.addInstruction(`push ${this.retrieveFromLocation(register)}`);
		if (free) this.freeRegister(register);

		if (updateStackPointerOffset) this.assembly.moveStackPointerOffset(-8);
	}
	
	popIntoLocation(loc) {
		if (loc.type != "register") throw "Can only pop into register.";

		this.assembly.addInstruction(`pop ${this.retrieveFromLocation(loc)}`);
		
		this.assembly.moveStackPointerOffset(8);
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

	//Can receive register name as a single string
	//Or a location object
    freeRegister(loc) {
        if (typeof loc == "object") {
			//Don't try to free location if it isn't a register
			if (loc.type != "register") return;

			//If it is a register, get just the name
			loc = loc.loc;
		}

		this.registers[loc] = true;
    }


	freeAllRegisters() {
		for (let register in this.registers) this.registers[register] = true;
	}

	getUsedRegisters() {
		let usedRegisters = []
		for (let register in this.registers) {
			if (!this.registers[register]) {
				let registerLocation = new Location("register", register, {
					identifier: {value: "uint64"}
				});

				usedRegisters.push(registerLocation);
			}
		}

		return usedRegisters;
	}

	saveRegisters() {
		let usedRegisters = this.getUsedRegisters();
		
		for (let register of usedRegisters) this.pushLocation(register, true, false)
		
		return usedRegisters;
	}

	loadRegisters(usedRegisters) {
		for (let register of usedRegisters.reverse()) this.popIntoLocation(register);
	}

	allocateData(name, size, values) {
		this.assembly.addDataEntry(name, size, values.join(", "));
	}

	allocateBSS(name, bytes) {
		this.assembly.addBSSEntry(name, bytes);
	}

	/*allocateArray(name, dataType, values) {
		//Convert data type into assembly declare (db, dw, dd, dq)
		let dataTypeSizeBits = this.getSizeFromDataType(dataType);
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
	allocateArrayStack(name, dataType, values) {
		let elementSizeBits = this.getSizeOfDataTypeElement(dataType);
		let arraySizeBytes = (elementSizeBits / 8) * values.length;

		let operationSize = this.getOperationSize(dataType);

		//Allocate required bytes on the stack
		this.assembly.moveStackPointer(-arraySizeBytes);

		//Move data into allocated space
		for (let i = 0; i < values.length; i++) {
			let offset = "";
			if (i) offset = ` + ${i}`;

			this.assembly.addInstruction(`mov ${operationSize} [rsp${offset}], ${values[i]}`);
		}

		let dataTypeArray = structuredClone(dataType);
		dataTypeArray.pointer = 1;
		
		return Location.Stack(this.assembly.stackPointerOffset, dataTypeArray);
	}

	allocateArrayBSS(name, dataType) {
		this.allocateBSS(name, this.getSizeOfDataTypeElement(dataType) / 8 * dataType.arraySize.value);
		
		return new Location("memory", name, dataType);
	}
	
	allocateStackSpace(dataType) {
		let bytes;
		if (dataType.pointer) {
			bytes = dataType.arraySize.value * (this.getSizeOfDataTypeElement(dataType) / 8);
		} else {
			bytes = this.getSizeOfDataType(dataType) / 8;
		}
		
		this.assembly.moveStackPointer(-bytes);

		let dataTypeArray = structuredClone(dataType);
		dataTypeArray.pointer = 1;
		
		return Location.Stack(this.assembly.stackPointerOffset, dataTypeArray);
	}
}

module.exports = Memory;
