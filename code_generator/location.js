
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
	static Stack(baseOffset, dataType) {
		let loc = new Location("stack", null, dataType);

		loc.baseOffset = baseOffset;
		
		return loc;
	}
}

module.exports = Location;
