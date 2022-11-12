const Location = require("./location");

//Manages usage of data segments (data, rodata, bss), stack, heap, and registers
class Memory {
	constructor(scope, assembly) {
		this.scope = scope;
		this.assembly = assembly;

        this.registers = {
            //"a": true,  Reserved for div instruction and returning up to 64 bits from functions
            "b": true,
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

		let dataTypeSizeBits = this.getSizeFromDataType(loc.dataType);
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
		if (requiredDataType.identifier.value == currentDataType.identifier.value) return true; //Types are already the same, no need to cast

		//Expression data type and variable data type do not match, can we implicitly typecast?
		if (requiredDataType.identifier.value.startsWith("uint") && currentDataType.identifier.value.startsWith("uint")) {
			//Integer typecasting
			let requiredBitSize = this.getSizeFromDataType(requiredDataType);
			let currentBitSize = this.getSizeFromDataType(currentDataType);
				
			//if (requiredBitSize >= currentBitSize) return true;
			
			currentDataType.identifier.value = requiredDataType.identifier.value;
			return true;
		}

		return false;
	}

	//Returns size in bits of a given data type
	getSizeFromDataType(dataType) {
		dataType = dataType.identifier.value;

		if (dataType == "uint8" || dataType == "int8") return 8;
		if (dataType == "uint16" || dataType == "int16") return 16;
		if (dataType == "uint32" || dataType == "int32") return 32;
		if (dataType == "uint64" || dataType == "int64") return 64;

		throw `Cannot determine size of data type "${dataType}"`;
	}

	//Generates corresponding assembly code that represents the location of some data (registers/memory/stack)
	retrieveFromLocation(loc) {
		if (loc.type == "register") {
			let bytesPerElement = this.getSizeFromDataType(loc.dataType) / 8;
			
			let memoryOffset = "";
			if (loc.index) memoryOffset = ` + ${loc.index * bytesPerElement}`;

			return `${this.locationToRegisterName(loc)}${memoryOffset}`;
		} else if (loc.type == "memory") {
			let bytesPerElement = this.getSizeFromDataType(loc.dataType) / 8;
			
			let memoryOffset = "";
			if (loc.index) memoryOffset = ` + ${loc.index * bytesPerElement}`;

			return `[${loc.loc}${memoryOffset}]`;
		} else if (loc.type == "stack") {
			let totalOffset = loc.baseOffset + (loc.index ? loc.index : 0);

			let memoryOffset = "";
			if (totalOffset) memoryOffset = (totalOffset > 0) ? ` + ${totalOffset}` : ` - ${-totalOffset}`;

			return `[rbp${memoryOffset}]`;
		} else {
			throw `Cannot handle location type ${loc.type}`;
		}
	}

	/*
	moveRegisterIntoLocation(loc, registerLocation) {
		if (registerLocation.type != "register") throw `Location type is not a register.`;

		loc = this.retrieveFromLocation(loc);
		
		this.assembly.addInstruction(`mov ${loc}, ${registerLocation.loc}`);
	}
	*/

	//Performs move on locations, not limited to just registers (stack, memory, etc)
	locationMove(destinationLocation, sourceLocation) {
		let destinationName = this.retrieveFromLocation(destinationLocation);
		let sourceName = this.retrieveFromLocation(sourceLocation);
	
		this.assembly.addInstruction(`mov ${destinationName}, ${sourceName}`);
	}
	
	//Moves location into a specific register
	moveLocationIntoRegister(destinationRegister, sourceLocation) {
		let destinationRegisterLocation = new Location("register", destinationRegister, sourceLocation.dataType);

		this.locationMove(destinationRegisterLocation, sourceLocation);
	}
	
	//Moves location into a newly allocated register and returns the register, if the location is already a register nothing will happen
	moveLocationIntoARegister(loc) {
		if (loc.type == "register") return loc;

		let registerLocation = new Location("register", this.allocateRegister(), loc.dataType);
		this.locationMove(registerLocation, loc);
		
		return registerLocation;
	}

	moveIntegerIntoARegister(integer) {
		let registerLocation = new Location("register", this.allocateRegister(), this.decideIntegerDataType(integer));
		this.assembly.addInstruction(`mov ${this.retrieveFromLocation(registerLocation)}, ${integer.toString()}`);

		return registerLocation;
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
		let dataTypeSizeBits = this.getSizeFromDataType(dataType);
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

		return new Location.Stack(this.assembly.stackPointerOffset);
	}

	allocateArrayBSS(name, dataType) {
		this.allocateBSS(name, this.getSizeFromDataType(dataType) / 8 * dataType.arraySize.value);
		
		return new Location("memory", name, dataType);
	}
	
	allocateStackSpace(dataType) {
		let arraySizeBytes = dataType.arraySize.value * (this.getSizeFromDataType(dataType) / 8);
		this.assembly.moveStackPointer(-arraySizeBytes);
		
		return Location.Stack(this.assembly.stackPointerOffset);
	}
}

module.exports = Memory;
