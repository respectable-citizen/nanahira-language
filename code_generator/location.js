
class Location {
	constructor(type, loc, dataType) {
		this.type = type;
		this.loc = loc;
		
		console.log("receiving");
		console.log(dataType);
		
		if (typeof dataType == "string") {
			this.dataType = {
				dataType: dataType
			};
		} else {
			this.dataType = {
				dataType: dataType.identifier.value,
				isArray: dataType.isArray,
				arrySize: dataType.arraySize ? dataType.arraySize.value : undefined
			};
		}
	}
}

module.exports = Location;
