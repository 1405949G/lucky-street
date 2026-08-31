/**
 * games/street-trivia/server/questions.js - Bundled question bank + selector
 * Image support: optional imageUrl per question (null if text-only)
 * Bundled + API fallback handled by caller (tries OpenTDB before falling back here)
 */

export const BANK = [
  // general
  { category:"general", difficulty:"easy", q:"What does 'Lucky Street' celebrate as its core vibe?", options:["Luck and togetherness","Solo racing","Silent study","Debt collection"], correctIndex:0, imageUrl:null },
  { category:"general", difficulty:"easy", q:"How many sides does a dice have?", options:["4","6","8","12"], correctIndex:1, imageUrl:null },
  { category:"general", difficulty:"medium", q:"Which word means 'a lucky coincidence'?", options:["Serendipity","Oblivion","Tenacity","Anomaly"], correctIndex:0, imageUrl:null },
  { category:"general", difficulty:"hard", q:"Which psychological bias makes us overvalue lucky streaks?", options:["Hot-hand fallacy","Anchoring","Sunk cost","Confirmation"], correctIndex:0, imageUrl:null },
  { category:"general", difficulty:"easy", q:"A standard deck has how many aces?", options:["2","3","4","5"], correctIndex:2, imageUrl:null },
  { category:"general", difficulty:"medium", q:"What is the collective noun for a group of flamingos?", options:["Flamboyance","Murder","Gaggle","Pride"], correctIndex:0, imageUrl:null },

  // science
  { category:"science", difficulty:"easy", q:"What planet is known as the Red Planet?", options:["Venus","Mars","Jupiter","Saturn"], correctIndex:1, imageUrl:null },
  { category:"science", difficulty:"easy", q:"H2O is the chemical formula for?", options:["Oxygen","Hydrogen","Water","Salt"], correctIndex:2, imageUrl:null },
  { category:"science", difficulty:"medium", q:"What is the hardest natural substance on Earth?", options:["Gold","Iron","Diamond","Quartz"], correctIndex:2, imageUrl:null },
  { category:"science", difficulty:"medium", q:"How many chromosomes do humans have?", options:["44","46","48","50"], correctIndex:1, imageUrl:null },
  { category:"science", difficulty:"hard", q:"What particle has a negative charge?", options:["Proton","Neutron","Electron","Photon"], correctIndex:2, imageUrl:null },
  { category:"science", difficulty:"hard", q:"Which element has atomic number 79?", options:["Silver","Gold","Copper","Iron"], correctIndex:1, imageUrl:null },
  { category:"science", difficulty:"easy", q:"What gas do plants breathe in?", options:["Oxygen","Nitrogen","Carbon dioxide","Helium"], correctIndex:2, imageUrl:null },
  { category:"science", difficulty:"medium", q:"Speed of light is approx?", options:["300,000 km/s","150,000 km/s","450,000 km/s","1,000 km/s"], correctIndex:0, imageUrl:null },

  // history
  { category:"history", difficulty:"easy", q:"In which year did World War II end?", options:["1943","1945","1947","1950"], correctIndex:1, imageUrl:null },
  { category:"history", difficulty:"medium", q:"Who was the first person to walk on the moon?", options:["Buzz Aldrin","Neil Armstrong","Yuri Gagarin","Michael Collins"], correctIndex:1, imageUrl:null },
  { category:"history", difficulty:"hard", q:"The ancient city of Petra is in which modern country?", options:["Egypt","Jordan","Turkey","Iran"], correctIndex:1, imageUrl:null },
  { category:"history", difficulty:"easy", q:"The Great Wall is primarily in which country?", options:["Japan","China","India","Korea"], correctIndex:1, imageUrl:null },
  { category:"history", difficulty:"medium", q:"Who painted the Mona Lisa?", options:["Michelangelo","Leonardo da Vinci","Raphael","Donatello"], correctIndex:1, imageUrl:null },

  // geography
  { category:"geography", difficulty:"easy", q:"What is the capital of France?", options:["Berlin","Madrid","Paris","Rome"], correctIndex:2, imageUrl:null },
  { category:"geography", difficulty:"easy", q:"Which continent is the Sahara Desert in?", options:["Asia","Africa","Australia","South America"], correctIndex:1, imageUrl:null },
  { category:"geography", difficulty:"medium", q:"Mount Everest lies on the border of Nepal and?", options:["China","India","Bhutan","Tibet"], correctIndex:0, imageUrl:null },
  { category:"geography", difficulty:"medium", q:"Which river is the longest in the world?", options:["Amazon","Nile","Yangtze","Mississippi"], correctIndex:1, imageUrl:null },
  { category:"geography", difficulty:"hard", q:"What is the smallest country by area?", options:["Monaco","Vatican City","San Marino","Liechtenstein"], correctIndex:1, imageUrl:null },
  { category:"geography", difficulty:"easy", q:"How many oceans are there?", options:["4","5","6","7"], correctIndex:1, imageUrl:null },

  // pop
  { category:"pop", difficulty:"easy", q:"Which show featured the coffee shop 'Central Perk'?", options:["Friends","Seinfeld","How I Met Your Mother","The Office"], correctIndex:0, imageUrl:null },
  { category:"pop", difficulty:"medium", q:"Who sang 'Blinding Lights'?", options:["The Weeknd","Post Malone","Dua Lipa","Bruno Mars"], correctIndex:0, imageUrl:null },
  { category:"pop", difficulty:"hard", q:"Which artist holds the record for most Grammy wins?", options:["Beyoncé","Quincy Jones","Stevie Wonder","Georg Solti"], correctIndex:0, imageUrl:null },
  { category:"pop", difficulty:"easy", q:"What is the name of the toy cowboy in Toy Story?", options:["Woody","Buzz","Jessie","Andy"], correctIndex:0, imageUrl:null },

  // movies
  { category:"movies", difficulty:"easy", q:"Who directed 'Inception'?", options:["Christopher Nolan","Steven Spielberg","James Cameron","Denis Villeneuve"], correctIndex:0, imageUrl:null },
  { category:"movies", difficulty:"medium", q:"Which film won Best Picture in 2020?", options:["1917","Parasite","Joker","Once Upon..."], correctIndex:1, imageUrl:null },
  { category:"movies", difficulty:"medium", q:"What is the highest-grossing film of all time (unadjusted)?", options:["Avatar","Avengers: Endgame","Titanic","Star Wars"], correctIndex:0, imageUrl:null },
  { category:"movies", difficulty:"hard", q:"In 'The Matrix', what pill does Neo take?", options:["Blue","Red","Green","Yellow"], correctIndex:1, imageUrl:null },
  { category:"movies", difficulty:"easy", q:"Which superhero is known as the 'Man of Steel'?", options:["Batman","Superman","Iron Man","Hulk"], correctIndex:1, imageUrl:null },

  // music
  { category:"music", difficulty:"easy", q:"How many members are in the Beatles?", options:["3","4","5","6"], correctIndex:1, imageUrl:null },
  { category:"music", difficulty:"medium", q:"Which instrument has 88 keys?", options:["Guitar","Piano","Violin","Drums"], correctIndex:1, imageUrl:null },
  { category:"music", difficulty:"hard", q:"Who composed the 'Four Seasons'?", options:["Bach","Vivaldi","Mozart","Beethoven"], correctIndex:1, imageUrl:null },

  // sports
  { category:"sports", difficulty:"easy", q:"How many players on a football (soccer) team on field?", options:["9","10","11","12"], correctIndex:2, imageUrl:null },
  { category:"sports", difficulty:"medium", q:"Which country has won the most FIFA World Cups?", options:["Germany","Italy","Argentina","Brazil"], correctIndex:3, imageUrl:null },
  { category:"sports", difficulty:"hard", q:"In tennis, what comes after deuce?", options:["Advantage","Love","Set point","Break"], correctIndex:0, imageUrl:null },
  { category:"sports", difficulty:"easy", q:"Olympics are held every how many years?", options:["2","4","6","8"], correctIndex:1, imageUrl:null },

  // tech
  { category:"tech", difficulty:"easy", q:"What does 'HTML' stand for?", options:["Hyper Text Markup Language","High Tech Modern Language","Hyper Transfer Markup Link","Home Tool Markup"], correctIndex:0, imageUrl:null },
  { category:"tech", difficulty:"medium", q:"Who founded Tesla Motors (co-founder CEO)?", options:["Elon Musk","Jeff Bezos","Bill Gates","Mark Zuckerberg"], correctIndex:0, imageUrl:null },
  { category:"tech", difficulty:"hard", q:"Which language compiles to WebAssembly via Emscripten mainly?", options:["Python","C/C++","Ruby","PHP"], correctIndex:1, imageUrl:null },
  { category:"tech", difficulty:"easy", q:"What company makes the iPhone?", options:["Samsung","Google","Apple","Microsoft"], correctIndex:2, imageUrl:null },
  { category:"tech", difficulty:"medium", q:"What does CPU stand for?", options:["Central Processing Unit","Computer Personal Unit","Central Power Unit","Core Processing Utility"], correctIndex:0, imageUrl:null },

  // image samples (use placeholder image urls)
  { category:"general", difficulty:"easy", q:"Which landmark is shown? (Eiffel Tower)", options:["Eiffel Tower","Big Ben","Statue of Liberty","Burj Khalifa"], correctIndex:0, imageUrl:"https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=480&q=60" },
  { category:"geography", difficulty:"medium", q:"This island nation is known for cherry blossoms — which is it?", options:["Japan","Thailand","Vietnam","Philippines"], correctIndex:0, imageUrl:"https://images.unsplash.com/photo-1492571350019-22de08371fd3?w=480&q=60" },
  { category:"science", difficulty:"medium", q:"Which planet shows these rings?", options:["Jupiter","Saturn","Uranus","Neptune"], correctIndex:1, imageUrl:"https://images.unsplash.com/photo-1614314107768-601506d1387e?w=480&q=60" },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickQuestions({ category = "mixed", difficulty = "mixed", count = 10, excludeIds = [] } = {}) {
  let pool = BANK.slice();
  if (category && category !== "mixed") pool = pool.filter(q => q.category === category);
  if (difficulty && difficulty !== "mixed") pool = pool.filter(q => q.difficulty === difficulty);
  if (excludeIds.length) {
    const ex = new Set(excludeIds);
    pool = pool.filter((_, i) => !ex.has(i));
  }
  // if pool too small, refill from all (mixed fallback)
  if (pool.length < count) {
    const extra = BANK.filter(q => !pool.includes(q));
    pool = pool.concat(shuffle(extra));
  }
  const picked = shuffle(pool).slice(0, count).map((q, idx) => ({
    id: `q_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2,6)}`,
    category: q.category,
    difficulty: q.difficulty,
    q: q.q,
    options: q.options.slice(),
    correctIndex: q.correctIndex,
    imageUrl: q.imageUrl || null,
  }));
  return picked;
}

// Optional API fallback: try OpenTDB, else pickQuestions
export async function fetchQuestionsWithFallback(opts) {
  // Attempt OpenTDB if global fetch exists and category not image-dependent
  try {
    if (typeof fetch !== "undefined" && opts.category !== "mixed") {
      const catMap = { general:9, science:17, history:23, geography:22, pop:14, movies:11, music:12, sports:21, tech:18 };
      const catId = catMap[opts.category];
      const diffMap = { easy:"easy", medium:"medium", hard:"hard" };
      const diffParam = opts.difficulty !== "mixed" ? `&difficulty=${diffMap[opts.difficulty]||"medium"}` : "";
      const catParam = catId ? `&category=${catId}` : "";
      const amount = Math.min(20, opts.count || 10);
      const url = `https://opentdb.com/api.php?amount=${amount}${catParam}${diffParam}&type=multiple`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.results && json.results.length) {
          const mapped = json.results.slice(0, opts.count).map(r => {
            const correct = decodeHtml(r.correct_answer);
            const incorrect = r.incorrect_answers.map(decodeHtml);
            const options = shuffle([correct, ...incorrect]);
            return {
              id: `q_api_${Math.random().toString(36).slice(2,8)}`,
              category: opts.category,
              difficulty: r.difficulty === "easy" ? "easy" : r.difficulty==="hard"?"hard":"medium",
              q: decodeHtml(r.question),
              options,
              correctIndex: options.indexOf(correct),
              imageUrl: null,
            };
          });
          if (mapped.length >= Math.min(5, opts.count)) return mapped;
        }
      }
    }
  } catch {}
  return pickQuestions(opts);
}

function decodeHtml(s) {
  if (!s) return s;
  return s.replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&eacute;/g,"é").replace(/&ouml;/g,"ö").replace(/&uuml;/g,"ü");
}
