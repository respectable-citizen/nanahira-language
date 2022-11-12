
class Location {
	constructor(type, loc, dataType) {
		this.type = type;
		this.loc = loc;
		
		if (typeof dataType == "string") {
			this.dataType = {
				identifier: {value: dataType}
			};
		} else {
			this.dataType = dataType;
		}
	}

	//Constructor for location on the stack
	static Stack(baseOffset) {
		let loc = new Location("stack", null, {
			identifier: {value: "uint64"} //Parameters are passed 64 bits at a time no matter the data type
		});

		loc.baseOffset = baseOffset;
		
		return loc;
	}
}

module.exports = Location;
