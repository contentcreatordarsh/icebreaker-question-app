// Two-level "Topics" taxonomy + curated question pools.
//
// Topics are a second dimension alongside the 7 classic conversation Categories.
// Each parent group (Sports, Movies, …) has sub-topic leaves (Football, Cricket…),
// and each leaf has its own Light/Deep question pool — same shape as QUESTION_BANK.
// Topic questions flow through App's `overrideQuestion` path (like Packs), so they
// reuse the existing display + usage-consume machinery and keep Light/Deep/Random.
//
// All questions are conversation starters (opinions, stories, values) — not trivia.

export interface TopicLeaf {
  id: string;     // unique pool key, e.g. "sports.football"
  label: string;  // display label, e.g. "Football"
}

export interface TopicGroup {
  id: string;
  label: string;
  emoji: string;
  children: TopicLeaf[];
}

export const TOPICS: TopicGroup[] = [
  {
    id: 'sports',
    label: 'Sports',
    emoji: '⚽',
    children: [
      { id: 'sports.football', label: 'Football' },
      { id: 'sports.cricket', label: 'Cricket' },
      { id: 'sports.f1', label: 'F1' },
    ],
  },
  {
    id: 'movies',
    label: 'Movies',
    emoji: '🎬',
    children: [
      { id: 'movies.hollywood', label: 'Hollywood' },
      { id: 'movies.bollywood', label: 'Bollywood' },
      { id: 'movies.korean', label: 'Korean' },
    ],
  },
  {
    id: 'music',
    label: 'Music',
    emoji: '🎵',
    children: [
      { id: 'music.pop', label: 'Pop' },
      { id: 'music.desi', label: 'Desi' },
      { id: 'music.kpop', label: 'K-pop' },
    ],
  },
  {
    id: 'society',
    label: 'Politics & Society',
    emoji: '🌍',
    children: [
      { id: 'society.civic', label: 'Civic Life' },
      { id: 'society.world', label: 'World & History' },
    ],
  },
];

/** Flat lookup of leaf id → display label (for headers, share text, etc.). */
export const TOPIC_LABELS: Record<string, string> = Object.fromEntries(
  TOPICS.flatMap(g => g.children.map(c => [c.id, `${g.label} · ${c.label}`])),
);

export type TopicBank = Record<string, { Light: string[]; Deep: string[] }>;

export const TOPIC_BANK: TopicBank = {
  // ── Sports ────────────────────────────────────────────────────────────────
  'sports.football': {
    Light: [
      "Which footballer, past or present, would you most want at your dinner table?",
      "What's the first match you remember watching — and who were you with?",
      "If you could attend one football match in history, which would it be?",
      "Club loyalty or following the best players — which matters more to you?",
      "What's the most you've ever celebrated a goal?",
      "Messi or Ronaldo — and does your answer say something about you?",
      "If you walked out to music like a player, what would your song be?",
      "What's a football moment that genuinely moved you — happy or heartbreaking?",
    ],
    Deep: [
      "Has a team ever taught you something real about loyalty or heartbreak?",
      "Does the money in modern football ruin the romance of the game?",
      "Why do millions feel genuine grief over a sport they don't even play?",
      "Should national pride be tied to a football team?",
      "What does the way someone handles a loss reveal about them?",
      "Is it healthier to support a team that wins, or one that makes you suffer?",
      "What did football teach you that school never did?",
      "Would the world be calmer or just duller without tribal sports rivalries?",
    ],
  },
  'sports.cricket': {
    Light: [
      "Test, ODI, or T20 — and what does your pick say about your patience?",
      "Which cricketer would you want narrating your life?",
      "What's your earliest cricket memory?",
      "Bat, bowl, or field for one day as a pro — which and why?",
      "A backyard or street-cricket rule you grew up with and still defend?",
      "Which cricket rivalry gets you out of your seat?",
      "A piece of commentary you'll never forget?",
      "Gully cricket or stadium cricket — where's the real game?",
    ],
    Deep: [
      "Test cricket rewards patience over five days — is that a dying virtue?",
      "Does cricket carry more history and politics than other sports?",
      "What does 'walking' before you're given out say about character?",
      "Has a sport ever united your family across a generation gap?",
      "Is sledging clever competition or just disrespect?",
      "Why does a whole nation's mood swing on eleven people's afternoon?",
      "What's the lesson hidden in losing a match you dominated?",
      "Should sport and national identity really be this tightly bound?",
    ],
  },
  'sports.f1': {
    Light: [
      "Which F1 driver would you actually trust to drive you to the airport?",
      "Team principal for a day — what's the first thing you change?",
      "If you had a helmet design for your life, describe it.",
      "Which circuit would you fly across the world to see in person?",
      "Lights-out start or last-lap overtake — bigger thrill?",
      "If your personality were a team, which garage are you in?",
      "What got you into F1 — a race, a driver, or a Netflix binge?",
      "Pick your radio call-sign and the voice of your race engineer.",
    ],
    Deep: [
      "Is F1 a sport, an engineering contest, or theatre — and does it matter?",
      "Drivers risk their lives for our entertainment — how do you feel about that?",
      "What does the 'team orders' debate reveal about loyalty versus ambition?",
      "Is chasing marginal gains a good metaphor for how you live?",
      "When does competitive obsession tip into something unhealthy?",
      "Should a sport this expensive exist in a world this unequal?",
      "What's the real cost of being the best in the world at one tiny thing?",
      "Does a 'safety car' ever come out in your life — and do you resent it?",
    ],
  },

  // ── Movies ──────────────────────────────────────────────────────────────────
  'movies.hollywood': {
    Light: [
      "A movie you'll defend even though everyone says it's bad?",
      "Which Hollywood character would you want as a roommate?",
      "The film you've rewatched most — and why it keeps pulling you back?",
      "If your life got a Hollywood remake, who plays you?",
      "Best movie snack — and is talking during films a crime?",
      "A line of dialogue you actually quote in real life?",
      "Which fictional world would you spend a week inside?",
      "An actor whose films you'll watch no matter the reviews?",
    ],
    Deep: [
      "Has a film ever genuinely changed how you saw your own life?",
      "Why do we cry at things we know aren't real?",
      "Do Hollywood endings set us up for disappointment in real life?",
      "Which movie villain do you secretly understand?",
      "Is nostalgia for old films honest, or are we lying to ourselves?",
      "What story does Hollywood keep telling that you think is harmful?",
      "If you could wipe one film from memory to watch it fresh, which?",
      "What does your go-to comfort movie say about what you need?",
    ],
  },
  'movies.bollywood': {
    Light: [
      "A Bollywood song that instantly transports you somewhere?",
      "Which Bollywood family would you want to be adopted into?",
      "The film your family watches every single time it's on TV?",
      "Most overused Bollywood trope that you secretly love?",
      "A dialogue you and your friends still quote?",
      "Shah Rukh romance or full action-hero energy — your mood?",
      "Which wedding scene set unrealistic expectations for you?",
      "If your life had an opening song, what's the vibe?",
    ],
    Deep: [
      "Does Bollywood sell a version of love real relationships can't match?",
      "What does the 'happy ending against all odds' do to our hopes?",
      "Has a film shaped how your family talks about duty or sacrifice?",
      "Is the song-and-dance escapism healthy, or quiet avoidance?",
      "Which social issue did a film actually make you rethink?",
      "How has the idea of the 'good son or daughter' affected you?",
      "What story about your country do you wish films told more honestly?",
      "Do our films shape our values, or just reflect them back?",
    ],
  },
  'movies.korean': {
    Light: [
      "Which K-drama lead would survive a week in your city?",
      "A Korean film or show you made everyone around you watch?",
      "A Korean-food scene that made you instantly hungry?",
      "If your life were a K-drama, what's the title?",
      "Slow-burn romance or chaotic plot twists — your preference?",
      "A scene you rewound just to feel it again?",
      "Which character's wardrobe would you steal?",
      "An OST track that's living in your head right now?",
    ],
    Deep: [
      "Why did stories like Parasite hit such a global nerve about class?",
      "What do K-dramas understand about longing that other shows miss?",
      "Has Korean cinema shifted how you think about success and pressure?",
      "Why are we so drawn to stories about deep inequality?",
      "What does the love of 'healing' dramas say about how tired we are?",
      "Is the perfectionism in Korean storytelling inspiring or exhausting?",
      "A Korean ending you're still arguing with in your head?",
      "What can another culture's stories teach you about your own?",
    ],
  },

  // ── Music ─────────────────────────────────────────────────────────────────
  'music.pop': {
    Light: [
      "A pop song you're a little embarrassed to love but never skip?",
      "Whose concert would you do almost anything to attend?",
      "Your karaoke go-to that never fails?",
      "A song that instantly takes you back to one specific summer?",
      "If this week had a theme song, what is it?",
      "An album you can play start to finish with zero skips?",
      "Which pop star do you think would be a great dinner guest?",
      "The song you'd want played at your big celebration?",
    ],
    Deep: [
      "Why can a three-minute song hold an entire era of your life?",
      "Has a lyric ever said something you couldn't say yourself?",
      "Do we love the music, or the version of ourselves it reminds us of?",
      "Should an artist's life be separable from their art?",
      "What song would you want at your funeral — and what does it say?",
      "Has your taste in music changed who you are, or just revealed it?",
      "Why do sad songs feel so good when you're already sad?",
      "A song you can't play anymore because of who it reminds you of?",
    ],
  },
  'music.desi': {
    Light: [
      "The desi song that hijacks every wedding dance floor?",
      "Old Hindi classics or new-age Punjabi pop — which side are you on?",
      "A bhajan, ghazal, or qawwali that gives you goosebumps?",
      "Your go-to desi road-trip anthem?",
      "Whose voice feels like home to you?",
      "A song your parents played that you now secretly love?",
      "Antakshari — what's your unbeatable letter?",
      "The track that makes your whole family get up and dance?",
    ],
    Deep: [
      "How does music carry your culture across distance and generations?",
      "Does a song in your mother tongue hit differently — and why?",
      "What did the music in your home teach you about emotion?",
      "Is fusion music keeping tradition alive or slowly diluting it?",
      "A song that reconnected you to roots you'd drifted from?",
      "Do classic lyrics actually feel deeper, or is that just nostalgia?",
      "What would be lost if your community's music disappeared?",
      "Has a devotional or folk song moved you more than you expected?",
    ],
  },
  'music.kpop': {
    Light: [
      "The first K-pop song that genuinely pulled you in?",
      "Which group's concert is on your bucket list?",
      "A choreography you've (badly) tried to learn?",
      "Bias group, or 'I just like the bops'?",
      "A B-side better than the title track — make your case.",
      "Your hype song before something nerve-wracking?",
      "Which idol seems like they'd be a genuinely kind friend?",
      "A comeback that lived rent-free in your head?",
    ],
    Deep: [
      "What does the intensity of K-pop fandom say about our need to belong?",
      "Is the pressure on idols a fair price for the art they make?",
      "Why do songs in a language you don't speak still move you?",
      "What does stan culture get right — and wrong — about devotion?",
      "Has a fandom ever given you real community, or mostly real stress?",
      "Is the polish of K-pop inspiring, or a little dehumanizing?",
      "What do we project onto people we'll never actually meet?",
      "When does admiration quietly tip into parasocial illusion?",
    ],
  },

  // ── Politics & Society (kept non-partisan: values, history, civic life) ─────
  'society.civic': {
    Light: [
      "One small rule in your city you'd change tomorrow?",
      "If you ran your neighborhood for a day, the first improvement?",
      "A public space that genuinely makes your city better?",
      "Something your community does well that everyone should copy?",
      "The most underrated public service in daily life?",
      "If you could add one public holiday, what's it celebrating?",
      "A civic habit you wish more people had?",
      "What would actually get you to attend a town meeting?",
    ],
    Deep: [
      "What's one responsibility you think every citizen owes their community?",
      "Can you disagree deeply with someone and still respect them?",
      "What issue would you protest for — and what's stopped you so far?",
      "Does your generation have it easier or harder than your parents'?",
      "What would a fairer version of your society actually ask of you?",
      "Should voting be mandatory — why or why not?",
      "When, if ever, is it right to break a rule you believe is unjust?",
      "What do you owe to strangers you will never meet?",
    ],
  },
  'society.world': {
    Light: [
      "Which historical era would you visit for just one day?",
      "A history lesson that actually stuck with you?",
      "Which world city would you live in for a year, no constraints?",
      "A historical figure you'd most want to interview?",
      "An invention you're most grateful someone made?",
      "One moment in history you'd want to witness safely?",
      "A tradition from another culture you find genuinely beautiful?",
      "An 'old way' of doing things you think we were wrong to lose?",
    ],
    Deep: [
      "What lesson from history do you think we're busy repeating?",
      "Does knowing history make you more hopeful or more worried?",
      "Whose version of history did you grow up with — and who got left out?",
      "Is progress real, or do we just trade one set of problems for another?",
      "What might people 100 years from now judge us for?",
      "Can you love your country and criticize it at the same time?",
      "A belief you hold that your grandparents would find shocking?",
      "If the world's story has a moral so far, what is it?",
    ],
  },
};
