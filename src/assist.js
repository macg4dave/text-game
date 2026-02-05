const BASE_VOCAB = [
  "a","able","about","above","across","act","action","after","again","against","all","almost","along","already","also","always","am","among","an","and","another","any","are","around","as","ask","at","away","back","be","because","been","before","began","behind","being","below","best","better","between","big","both","but","by","call","came","can","case","change","come","could","course","day","did","different","do","does","done","down","each","early","end","enough","even","every","eye","face","fact","far","feel","few","find","first","for","form","found","from","full","gave","get","give","go","good","great","had","hand","has","have","he","head","hear","her","here","high","him","his","home","house","how","however","I","if","in","inside","into","is","it","its","just","keep","kind","knew","know","large","last","later","lay","lead","left","less","let","life","light","like","line","little","live","long","look","made","make","man","many","may","me","men","might","more","most","mother","move","much","must","my","name","near","need","never","new","next","no","not","now","number","of","off","often","old","on","one","only","open","or","other","our","out","over","own","part","people","place","play","point","put","read","right","room","run","said","same","saw","say","see","set","she","should","show","side","since","small","so","some","something","sound","still","such","take","tell","than","that","the","them","then","there","these","they","thing","think","this","those","thought","three","through","time","to","together","too","toward","turn","two","under","until","up","upon","use","very","voice","want","was","water","way","we","well","went","were","what","when","where","which","while","who","why","will","with","within","without","word","work","world","would","write","you","your",
  "attack","approach","ask","barter","climb","craft","defend","drop","eat","equip","explore","follow","give","hide","investigate","listen","look","move","open","pick","rest","run","search","sneak","speak","take","talk","travel","use","wait","whisper",
  "quest","signal","eclipse","market","tower","alley","station","vault","cipher","map","rumor","artifact","crew","district","portal","beacon"
];

export function assistText({ text, dynamicTexts = [] }) {
  const dynamicWords = extractWords(dynamicTexts.join(" "));
  const vocab = buildVocabulary(BASE_VOCAB, dynamicWords, 2000);

  const corrections = spellcheck(text, vocab, 3);
  const completions = autocomplete(text, vocab, 6);

  return { corrections, completions };
}

function extractWords(text) {
  if (!text) return [];
  const matches = text.toLowerCase().match(/[a-z']+/g);
  return matches ? matches.filter((word) => word.length > 1) : [];
}

function buildVocabulary(baseWords, dynamicWords, maxSize) {
  const set = new Set();
  baseWords.forEach((word) => set.add(word.toLowerCase()));
  dynamicWords.forEach((word) => set.add(word.toLowerCase()));
  return Array.from(set).slice(0, maxSize);
}

function spellcheck(text, vocab, maxSuggestions) {
  if (!text) return [];
  const tokens = text.match(/[A-Za-z']+/g) || [];
  const vocabSet = new Set(vocab);
  const corrections = [];

  tokens.forEach((token) => {
    const lower = token.toLowerCase();
    if (lower.length < 4) return;
    if (vocabSet.has(lower)) return;

    const suggestions = getClosestWords(lower, vocab, maxSuggestions);
    if (suggestions.length) {
      corrections.push({ token, suggestions });
    }
  });

  return corrections.slice(0, 6);
}

function autocomplete(text, vocab, limit) {
  if (!text) return [];
  const match = text.match(/[A-Za-z']+$/);
  if (!match) return [];
  const prefix = match[0].toLowerCase();
  if (prefix.length < 2) return [];

  const suggestions = vocab
    .filter((word) => word.startsWith(prefix) && word.length > prefix.length)
    .slice(0, limit);

  return suggestions;
}

function getClosestWords(token, vocab, limit) {
  const first = token[0];
  const candidates = vocab.filter((word) => word[0] === first);
  const scored = [];

  for (const word of candidates) {
    const distance = editDistance(token, word, 2);
    if (distance <= 2) scored.push({ word, distance });
  }

  return scored
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((item) => item.word);
}

function editDistance(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const dp = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = dp[i][0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
  }

  return dp[a.length][b.length];
}

export { extractWords };
