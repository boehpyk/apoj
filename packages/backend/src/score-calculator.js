import OpenAI from 'openai';
import levenshtein from 'fast-levenshtein';

let openai = null;

function getOpenAIClient() {
  if (!openai && process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-your-openai-api-key-here') {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: parseInt(process.env.OPENAI_TIMEOUT) || 10000
    });
  }
  return openai;
}

/**
 * Assess player guesses using ChatGPT API
 * @param {Array} originalSongs - Array of {clueIndex, title, artist, songId}
 * @param {Array} playerGuesses - Array of {playerId, playerName, guesses: [{clueIndex, title, artist, notes}]}
 * @returns {Promise<Array>} Assessment results per player per clue
 */
export async function assessGuessesWithAI(originalSongs, playerGuesses) {
  const client = getOpenAIClient();

  if (!client) {
    console.warn('[score-calculator] No valid OpenAI API key, using fallback scoring');
    return fallbackScoring(originalSongs, playerGuesses);
  }

  try {
    const prompt = buildPrompt(originalSongs, playerGuesses);

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: 'You are a music quiz judge. Rate how close player guesses are to original songs on a 0-10 scale. Consider title accuracy, phonetic similarity, partial matches, and artist accuracy. Return ONLY valid JSON array without any markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.choices[0].message.content.trim();

    // Remove markdown code blocks if present
    const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const assessments = JSON.parse(jsonContent);

    // Validate and format response
    return formatAIAssessments(assessments, playerGuesses, false);
  } catch (error) {
    console.error('[score-calculator] OpenAI API failed:', error.message);
    console.log('[score-calculator] Using fallback scoring');
    return fallbackScoring(originalSongs, playerGuesses);
  }
}

/**
 * Build ChatGPT prompt
 */
function buildPrompt(originalSongs, playerGuesses) {
  const songsStr = JSON.stringify(originalSongs.map(s => ({
    clueIndex: s.clueIndex,
    title: s.title,
    artist: s.artist
  })));

  const guessesStr = JSON.stringify(playerGuesses.map(pg => ({
    playerId: pg.playerId,
    playerName: pg.playerName,
    guesses: pg.guesses.map(g => ({
      clueIndex: g.clueIndex,
      title: g.title || '',
      artist: g.artist || '',
      notes: g.notes || ''
    }))
  })));

  return `Original Songs: ${songsStr}

Player Guesses: ${guessesStr}

For each player's guess, rate similarity on 0-10 scale:
- 10: Perfect match (title and artist exact)
- 8-9: Very close (minor spelling/variation)
- 6-7: Partial recognition (some words match)
- 3-5: Vague similarity
- 0-2: Incorrect

Return JSON array:
[{
  playerId: "string",
  clueIndex: number,
  score: number (0-10),
  reasoning: "brief explanation"
}, ...]`;
}

/**
 * Format AI assessments into standard structure
 */
function formatAIAssessments(assessments, playerGuesses, usedFallback) {
  return assessments.map(a => ({
    playerId: a.playerId,
    clueIndex: a.clueIndex,
    aiScore: a.score,
    reasoning: a.reasoning || '',
    usedFallback
  }));
}

/**
 * Fallback scoring using Levenshtein distance
 */
function fallbackScoring(originalSongs, playerGuesses) {
  const results = [];

  for (const pg of playerGuesses) {
    for (const guess of pg.guesses) {
      const original = originalSongs.find(s => s.clueIndex === guess.clueIndex);
      if (!original) continue;

      const titleSimilarity = calculateSimilarity(guess.title || '', original.title);
      const artistSimilarity = guess.artist
        ? calculateSimilarity(guess.artist, original.artist)
        : 0;

      // Convert similarity to 0-10 scale
      let aiScore = 0;
      if (titleSimilarity >= 0.95) {
        aiScore = 10;
      } else if (titleSimilarity >= 0.85) {
        aiScore = 8.5;
      } else if (titleSimilarity >= 0.75) {
        aiScore = 7;
      } else if (titleSimilarity >= 0.6) {
        aiScore = 5;
      } else if (titleSimilarity >= 0.4) {
        aiScore = 3;
      }

      // Boost if artist matches
      if (artistSimilarity >= 0.8) {
        aiScore = Math.min(10, aiScore + 1);
      }

      results.push({
        playerId: pg.playerId,
        clueIndex: guess.clueIndex,
        aiScore,
        reasoning: `Fallback scoring: title ${(titleSimilarity * 100).toFixed(0)}% match`,
        usedFallback: true
      });
    }
  }

  return results;
}

/**
 * Calculate string similarity (0-1)
 */
function calculateSimilarity(str1, str2) {
  const s1 = normalize(str1);
  const s2 = normalize(str2);

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const distance = levenshtein.get(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);

  return 1 - (distance / maxLen);
}

/**
 * Normalize string for comparison
 */
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Calculate final score with bonuses
 * @param {number} aiScore - AI assessment score (0-10)
 * @param {number} submissionTimeSeconds - Time taken to submit
 * @param {boolean} artistMatch - Whether artist matches exactly
 * @returns {Object} Score breakdown
 */
export function calculateScore(aiScore, submissionTimeSeconds, artistMatch) {
  const basePoints = Math.round(aiScore * 10); // 0-100

  let speedBonus = 0;
  if (submissionTimeSeconds < 30) {
    speedBonus = 25;
  } else if (submissionTimeSeconds < 45) {
    speedBonus = 15;
  }

  const artistBonus = artistMatch ? 30 : 0;

  const total = basePoints + speedBonus + artistBonus;

  return {
    basePoints,
    speedBonus,
    artistBonus,
    total
  };
}

/**
 * Check if artist matches (normalized comparison)
 */
export function checkArtistMatch(guessArtist, correctArtist) {
  if (!guessArtist || !correctArtist) return false;

  const similarity = calculateSimilarity(guessArtist, correctArtist);
  return similarity >= 0.8;
}
