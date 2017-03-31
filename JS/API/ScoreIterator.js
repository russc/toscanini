"use strict";

//"private static" utility definitions=========================================
const xml2js = require("xml2js");
const parser = new xml2js.Parser({explicitArray: false, mergeAttrs: true});
const pitchToMidiNum = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A":9, "B": 11};

function traverse(obj,func)
{
  for (let i in obj)
  {
    func.apply(this,[i, obj[i]]);
    if (obj[i] !== null && typeof(obj[i])==="object") traverse(obj[i],func);
  }
}

//create objects for each part, this will reduce searching whole score.
//part being the full name of parts, ex: Solo Violin, Violin I, Violin II
function makeInstrumentObjects(musicObj)
{
  let partNames = [];
  let instrumentObjects = {}; //will be like {"Flute" [..array of measures]}
  let measureArraysSeen = 0;

  function process(key, value) //builds array of instrument objects
  {
    //first find the part names as they"re always towards the top of file
    //This will be pushed in the correct order as we see them:
    if (key === "part-name") partNames.push(value);
    if (key === "measure")
    {
      const instrumentName = partNames[measureArraysSeen];
      instrumentObjects[instrumentName] = [];

      for (const measure of value)
      {
        instrumentObjects[instrumentName].push(measure);
      }
      measureArraysSeen++;
    }
  }

  traverse(musicObj, process);
  return instrumentObjects;
}

function ScoreIterable(instrumentObjects)
{
  let scoreIterable = {};
  let part = [];

  for (let instrumentName in instrumentObjects)
  {
    for (let measure of instrumentObjects[instrumentName])
    {
      let midiNum = 0;
      let timeNotesMap = new Map(); //contains {"default-x", [pitches]}
      //^ MUST USE MAP NOT OBJECT to ensure notes are always in correct order
      //strategy: loop through measure to see symbols happening
      //at same points in time (default-x)        measureArraysSeen++;

      let voiceTimes = [];
      // ^^^ [5, 2] means voice 1 currently at 5, voice 2 currently at 2
      //voiceTimes[voice] => gives the time in beats the voice is from
      //beginning of measure
      let bassNoteDuration = -123; //bass note of potential chord!
      let notes = measure["note"];

      if (notes !== undefined) //NOTE: returns an array of note tags for a measure
      {
       for (let singleNote of notes)
       {
         let voice = parseInt(singleNote["voice"]);

         //check if first time seeing this voice
         if (voice === undefined)
         {
           throw new Error("No voice tag??");
         }
         else
         {
           while (voiceTimes.length < voice)
           {
             voiceTimes.push(0);
           }
         }

         if (singleNote["pitch"] !== undefined)
         {
           //1) Calculate midinum
           //TODO: make helper
           midiNum += pitchToMidiNum[singleNote["pitch"]["step"]];
           if (singleNote["pitch"]["alter"] !== undefined)
              midiNum += parseInt(singleNote["pitch"]["alter"]);
           midiNum += parseInt(singleNote["pitch"]["octave"]) * 12;

           let note = {};
           note.midiNum = midiNum;
           note.duration = parseInt(singleNote["duration"]);

           let currentTime = voiceTimes[voice - 1];

           //NOTE:two notes of same duration at same time can be same voice
           //two notes of different duration at same start time are two voices
           //^ this is mentioned in the musicxml standard!
           //only single voice playing multiple notes has chord tag
           if (singleNote["chord"] !== undefined)
           {
             currentTime = currentTime - bassNoteDuration;
           }
          //  console.log("currentTime", currentTime);
          //  console.log("note", note);
           let existingVal = timeNotesMap.get(currentTime);
          //  console.log("existing", existingVal);

           if (existingVal)
           {
            //  console.log("existingVal", existingVal);
             existingVal.push(note);
             timeNotesMap.set(currentTime, existingVal);
           }
           else
           {
             let arr = [];
             arr.push(note);
             timeNotesMap.set(currentTime, arr);
           }

           if (singleNote["chord"] === undefined)
           {
             voiceTimes[voice - 1] += note.duration;
             bassNoteDuration = note.duration;
           }
           midiNum = 0;
         }
         else if (singleNote["rest"] !== undefined)
         {
           let currentTime = voiceTimes[voice - 1];
           let existingVal = timeNotesMap.get(currentTime);

           if (existingVal)
           {
             timeNotesMap.set(currentTime, existingVal);
           }
           else
           {
             let arr = [];
             arr.push(parseInt(singleNote["duration"]));
             timeNotesMap.set(currentTime, arr);
           }

           part.push(singleNote["duration"]); //TODO
         }
       } //loop through measure

       let sortedKeys = [];

       for (let key of timeNotesMap.keys())
       {
         sortedKeys.push(key);
       }
       sortedKeys.sort();

       for (let key of sortedKeys)
       {
         let timeStampedMap = new Map();
         timeStampedMap.set(key, timeNotesMap.get(key));
         part.push(timeStampedMap);
       }

       console.log("timeNotesMap", timeNotesMap);
     } //if note
   } //instrumentName

   scoreIterable[instrumentName] = part; //TODO
 } //loop through instruments

  return scoreIterable;
}

const errors =
{
  "noValidInstrumentSelected": 'No valid instrument selected, ex: ("Flute")!',
  "noNext": "no next exists",
  "noPrev": "no prev exists!",
  "invalidPosition": "setPosition to invalid index"
};

//=============================================================================
const factoryScoreIterator = (MusicXML) =>
{
  let musicObj;
  parser.parseString(MusicXML, function (err, jsObj)
  {
    if (err) throw err;
    musicObj = jsObj;
  });

  const instrumentObjects = makeInstrumentObjects(musicObj);
  const scoreIterator = {};
  let scoreIterable = ScoreIterable(instrumentObjects);
  // console.dir(scoreIterable);

  scoreIterable["Classical Guitar"].forEach((map) => console.log(map));
  let selectedInstrument = "NONE";
  let currentIndex = -1;

  scoreIterator.selectInstrument = (instrumentName) =>
  {
    selectedInstrument = instrumentName;
  };

  scoreIterator.next = () =>
  {
    if (currentIndex === scoreIterable[selectedInstrument].length - 1)
    {
      throw new Error(errors.noNext);
    }
    else
    {
      currentIndex++;
    }
    if (scoreIterable[selectedInstrument] === undefined)
      throw new Error(errors.noValidInstrumentSelected);
    return scoreIterable[selectedInstrument][currentIndex];
  };

  scoreIterator.prev = () =>
  {
    if (currentIndex === 0)
    {
      throw new Error("No prev exists!");
    }
    else
    {
      currentIndex--;
    }

    if (scoreIterable[selectedInstrument] === undefined)
      throw new Error(errors.noValidInstrumentSelected);
    return scoreIterable[selectedInstrument][currentIndex];
  };

  scoreIterator.hasNext = () =>
  {
    if (scoreIterable[selectedInstrument] === undefined)
      throw new Error(errors.noValidInstrumentSelected);

    return (currentIndex < scoreIterable[selectedInstrument].length - 1);
  };

  scoreIterator.hasPrev = () =>
  {
    if (scoreIterable[selectedInstrument] === undefined)
      throw new Error(errors.noValidInstrumentSelected);

    return (currentIndex > 0);
  };

  scoreIterator.getPosition = () => currentIndex;

  scoreIterator.setPosition = (position) =>
  {
    if (position > scoreIterable.length -1)
      throw new Error(errors.invalidPosition);
    currentIndex = position;
  };
  return scoreIterator;
}; //end of factory

module.exports = factoryScoreIterator;
