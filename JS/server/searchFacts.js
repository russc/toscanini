const fs = require("fs");
const factsJSON = fs.readFileSync("./facts.json");
const factsMap = new Map(JSON.parse(factsJSON));

//queries of form {"flute": {"minPitch": 50, "maxPitch": 80}};
module.exports = (query) => //ex: invoked w searchFacts(query)
{
	const matchingPieces = [];
  
  let queryComposer;
  if ("composer" in query)
  {
    queryComposer = query["composer"];
    delete query["composer"];
  }
  
  let queryTempo;
  if ("tempo" in query)
  {
    console.log("queryTempo should be", query["tempo"]);
    queryTempo = query["tempo"];
    delete query["tempo"];
  }

  const queryInstrumentNames = Object.keys(query);
  
  //iterate over pieces in our facts database
  //................value, key
  factsMap.forEach((pieceFacts, pieceName) =>
	{
    
    //check if our piece is by the composer they want
    if (queryComposer && !pieceName.toLowerCase().includes(queryComposer))
      return false;
    
    if (queryTempo)
    {
      for (let tempo of pieceFacts["tempos"])
      {
        if (tempo < queryTempo["minPitch"] || tempo > queryTempo["maxPitch"])
          return false;
      }
    }
    
    //see if piece has query instruments and if they're in range
    //to do so we need to check substrings, so "trumpet in C" passes for query "trumpet"
    const pieceInstrumentNames = Object.keys(pieceFacts["instrumentRanges"]);
    //console.log("queryInstrumentNames", queryInstrumentNames);
     
    for (let queryInstrumentName of queryInstrumentNames)
		{
      let equivalentInstrumentName;
  
      for (let pieceInstrumentName of pieceInstrumentNames)
      {
        if (pieceInstrumentName.includes(queryInstrumentName))
           equivalentInstrumentName = pieceInstrumentName;
      }
      
       if (equivalentInstrumentName === undefined)
       {
         // console.log(pieceName + "does not have ", queryInstrumentName);
          return false;
       }
       
     //  console.log("equivalentInstrumentName ", equivalentInstrumentName);
			 const minPitch = pieceFacts["instrumentRanges"][equivalentInstrumentName]["minPitch"];
			 const maxPitch = pieceFacts["instrumentRanges"][equivalentInstrumentName]["maxPitch"];
			 const queryMinPitch = query[queryInstrumentName]["minPitch"];
			 const queryMaxPitch = query[queryInstrumentName]["maxPitch"];
	
			 if (minPitch < queryMinPitch || maxPitch > queryMaxPitch)
		   {
         //console.log(pieceName + " range issue");
         return false
       }          	
    }
    
    matchingPieces.push(pieceName); //if it made it this far it passes!

  });
  
	return matchingPieces;
}

