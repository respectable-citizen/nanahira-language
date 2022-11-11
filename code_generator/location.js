
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
}

module.exports = Location;
