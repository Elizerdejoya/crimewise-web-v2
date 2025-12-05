const db = require('./db');
const { GoogleGenAI } = require('@google/genai');
const apiKeyManager = require('./apiKeyManager');

async function gradeStudent(studentId, examId, teacherFindings, studentFindings, apiKeyObj = null) {
  console.log('[GRADER] Scheduling grading for student', studentId, 'exam', examId);
  
  // PRE-CHECK: If answers are identical/nearly identical, return perfect score immediately
  const normalize = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const tNorm = normalize(teacherFindings);
  const sNorm = normalize(studentFindings);
  
    if (tNorm && sNorm && tNorm === sNorm) {
    console.log('[GRADER] EXACT MATCH DETECTED: Identical answers for student', studentId);
    const perfectScore = {
      accuracy: 100,
      completeness: 100,
      clarity: 100,
      objectivity: 100,
      overall: 100
    };
    const perfectFeedback = 'Perfect! Your findings match the teacher\'s answer exactly. You demonstrated excellent attention to detail and comprehensive understanding of the forensic analysis.';
    try {
      await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response, api_key_index) VALUES (${studentId}, ${examId}, ${perfectScore.overall}, ${perfectScore.accuracy}, ${perfectScore.completeness}, ${perfectScore.clarity}, ${perfectScore.objectivity}, ${perfectFeedback}, ${'EXACT_MATCH_PRECHECK'}, ${null})`;
    } catch (dbErr) {
      console.error('[GRADER] Failed to save perfect score grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
    }
    return { score: perfectScore.overall, feedback: perfectFeedback };
  }
  
  // Attempt to load per-question rubric weights from the exams->questions relationship
  let rubricWeights = { accuracy: 40, completeness: 30, clarity: 20, objectivity: 10 };
  // Track whether the external API call succeeded. If it did, parsing errors should NOT trigger
  // the network-based fallbacks — only true call failures (network/auth) should.
  let apiCallSucceeded = false;
  try {
    const examRow = await db.sql`SELECT * FROM exams WHERE id = ${examId} LIMIT 1`;
    const exam = Array.isArray(examRow) ? examRow[0] : examRow;
    if (exam && exam.question_id) {
      const qRow = await db.sql`SELECT * FROM questions WHERE id = ${exam.question_id} LIMIT 1`;
      const question = Array.isArray(qRow) ? qRow[0] : qRow;
      if (question && question.rubrics) {
        try {
          const parsed = typeof question.rubrics === 'string' ? JSON.parse(question.rubrics) : question.rubrics;
          rubricWeights = {
            accuracy: Number(parsed.accuracy ?? 40),
            completeness: Number(parsed.completeness ?? 30),
            clarity: Number(parsed.clarity ?? 20),
            objectivity: Number(parsed.objectivity ?? 10),
          };
        } catch (e) {
          // ignore parse errors and use defaults
        }
      }
    }
  } catch (e) {
    console.error('[GRADER] Could not load question rubrics, using defaults', e && e.message ? e.message : e);
  }

  const prompt = `You are a forensic handwriting analysis expert grading student work. Compare the student's findings to the teacher's official findings (the answer key).

CRITICAL RULES FOR 100% SCORING:
- If the student's findings are identical to the teacher's answer key → assign 100 to ALL components (accuracy, completeness, clarity, objectivity).
- If the student's findings match the teacher's findings with only minor wording differences → assign 100 to accuracy, completeness, and objectivity (clarity can be 95-100 based on language quality).
- If all major points from the answer key are covered with no missing details → assign 100 to completeness.
- EXAMPLES:
  • If teacher says: "The handwriting shows a rightward slant of approximately 45 degrees with moderate pressure"
    And student says: "The handwriting shows a rightward slant with moderate pressure at about 45 degrees"
    → This is ESSENTIALLY IDENTICAL → assign 100 to accuracy, completeness, clarity, objectivity.

Grading criteria (importance):
1. Accuracy (${rubricWeights.accuracy}%) - Does the student's findings match the teacher's findings? For exact matches or matches with only rewording, give 100. Deduct points only if information is incorrect or contradicts the answer key.
2. Completeness (${rubricWeights.completeness}%) - Did the student cover all important points from the answer key? If all major points match, give 100. Deduct only for missing substantive points.
3. Clarity (${rubricWeights.clarity}%) - Is the writing clear and understandable? Give 100 if the explanation is clear. Deduct only if the writing is confusing or poorly organized.
4. Objectivity (${rubricWeights.objectivity}%) - Did the student remain objective without personal bias? Give 100 if no bias detected. Deduct only for obvious subjective opinions.

IMPORTANT - OUTPUT REQUIREMENTS:
- Your feedback MUST use SIMPLE, CLEAR language suitable for criminology students. 
- DO NOT mention or reference JSON, data structures, field names, technical terms, or programming concepts.
- DO NOT use quoted identifiers like 'explanation', 'tableAnswers', 'field', 'section', 'format', 'structure', 'array', 'object'.
- Write feedback as if speaking to a fellow student studying forensic analysis.
- Focus ONLY on the forensic/criminology content, not on how the data is organized or formatted.

Teacher findings:
"""
${teacherFindings}
"""

Student findings:
"""
${studentFindings}
"""

Return ONLY valid JSON with these exact fields:
{
  "accuracy": (number 0-100),
  "completeness": (number 0-100),
  "clarity": (number 0-100),
  "objectivity": (number 0-100),
  "overall_score": (number 0-100),
  "feedback": "Brief feedback in simple, clear language. Example: 'You correctly identified the handwriting slant and pressure. You also noted the baseline characteristics well. Your analysis was clear and objective. One minor point: you could have elaborated more on the loop formations.'"
}`;

  try {
    let keyIndex = null;
    let usedApiKey = null;
    if (apiKeyObj && apiKeyObj.key) {
      usedApiKey = apiKeyObj.key;
      keyIndex = apiKeyObj.index;
    } else {
      // Fallback: request a key from manager (ai-worker should pass this normally)
      const k = apiKeyManager.getNextKey();
      usedApiKey = k.key;
      keyIndex = k.index;
      if (k.waitMs && k.waitMs > 0) await new Promise((r) => setTimeout(r, k.waitMs));
    }

    if (!usedApiKey) {
      console.error('[GRADER] Error: No API keys configured. Please set GEMINI_API_KEY_1 through GEMINI_API_KEY_6.');
      throw new Error('No Gemini API keys configured for grader');
    }

    const genAI = new GoogleGenAI({ apiKey: usedApiKey });

    // Try the Gemini call with a couple of retries to handle transient network issues
    let response = null;
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await genAI.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { role: 'user', parts: [{ text: prompt }] }
          ],
          config: { temperature: 0.0 }
        });
        break;
      } catch (callErr) {
        // Inspect for rate-limit or server errors
        const statusCode = callErr && (callErr.status || callErr.statusCode || (callErr.response && callErr.response.status));
        console.error(`[GRADER] Gemini call failed (attempt ${attempt}) status=${statusCode}:`, callErr && callErr.message ? callErr.message : callErr);
        // If 429, inform apiKeyManager to penalize this key
        if (statusCode === 429) {
          // Try to parse Retry-After header
          let retryAfter = null;
          try {
            if (callErr.response && callErr.response.headers && callErr.response.headers['retry-after']) {
              retryAfter = Number(callErr.response.headers['retry-after']);
            }
          } catch (e) {}
          apiKeyManager.reportFailure(keyIndex, 429, retryAfter);
        } else if (statusCode && statusCode >= 500) {
          apiKeyManager.reportFailure(keyIndex, statusCode, null);
        }

        if (attempt === maxRetries) throw callErr;
        // small backoff before retrying
        await new Promise((res) => setTimeout(res, attempt * 1000));
      }
    }

    const text = response.text;
    apiCallSucceeded = true;
    if (!text) throw new Error('No response from Gemini');

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const jsonStr = text.slice(start, end + 1);
        parsed = JSON.parse(jsonStr);
      } else throw err;
    }

    // Helpful debug logging (will show in Vercel logs). Keep concise.
    console.log('[GRADER] Raw model text:', text.slice(0, 800));
    console.log('[GRADER] Parsed JSON keys:', parsed && Object.keys(parsed));

    // Helper: parse numeric value from a variety of formats, e.g. "80%", "80", 80, "80.5"
    const parseNum = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (typeof v === 'string') {
        // extract first numeric substring
        const m = v.match(/-?\d+(?:\.\d+)?/);
        if (m) return Number(m[0]);
        return null;
      }
      return null;
    };

    let rawAcc = parseNum(parsed.accuracy ?? parsed.Accuracy ?? parsed.accuracy_percent ?? null);
    let rawComp = parseNum(parsed.completeness ?? parsed.Completeness ?? parsed.completeness_percent ?? null);
    let rawClar = parseNum(parsed.clarity ?? parsed.Clarity ?? parsed.clarity_percent ?? null);
    let rawObj = parseNum(parsed.objectivity ?? parsed.Objectivity ?? parsed.objectivity_percent ?? null);

    // If model returned only overall_score, distribute the overall into components using rubric weights
    let parsedOverall = parseNum(parsed.overall_score ?? parsed.overall ?? parsed.score ?? null);

    // If individual components are missing (null) but overall exists, compute proportional breakdown
    const totalWeight = (rubricWeights.accuracy || 0) + (rubricWeights.completeness || 0) + (rubricWeights.clarity || 0) + (rubricWeights.objectivity || 0) || 100;
    if (parsedOverall !== null) {
      if (rawAcc === null) rawAcc = Math.round(parsedOverall * (rubricWeights.accuracy || 0) / totalWeight);
      if (rawComp === null) rawComp = Math.round(parsedOverall * (rubricWeights.completeness || 0) / totalWeight);
      if (rawClar === null) rawClar = Math.round(parsedOverall * (rubricWeights.clarity || 0) / totalWeight);
      if (rawObj === null) rawObj = Math.round(parsedOverall * (rubricWeights.objectivity || 0) / totalWeight);
    }

    // Final numeric values (default to 0)
    const accuracy = Math.round(Number(rawAcc ?? 0));
    const completeness = Math.round(Number(rawComp ?? 0));
    const clarity = Math.round(Number(rawClar ?? 0));
    const objectivity = Math.round(Number(rawObj ?? 0));
    let overall = Number(parsed.overall_score ?? parsed.overall ?? parsed.score ?? NaN);
    if (Number.isNaN(overall)) {
      const totalWeight = (rubricWeights.accuracy || 0) + (rubricWeights.completeness || 0) + (rubricWeights.clarity || 0) + (rubricWeights.objectivity || 0) || 100;
      const wAcc = (rubricWeights.accuracy || 0) / totalWeight;
      const wComp = (rubricWeights.completeness || 0) / totalWeight;
      const wClar = (rubricWeights.clarity || 0) / totalWeight;
      const wObj = (rubricWeights.objectivity || 0) / totalWeight;
      overall = Math.round(accuracy * wAcc + completeness * wComp + clarity * wClar + objectivity * wObj);
    }

    let feedback = String(parsed.feedback ?? (parsed.comments ?? 'No feedback'));
    
    // Aggressively clean up feedback to remove any technical terms the AI might have included
    // Step 1: Remove quoted identifiers like 'explanation', "tableAnswers", etc.
    feedback = feedback.replace(/['"][^'"]*['"][,\.\s]?/g, ' ');
    
    // Step 2: Remove common technical/formatting words (case-insensitive)
    const technicalTerms = [
      /\bjson\b/gi,
      /\btableAnswers\b/gi,
      /\btable\b/gi,
      /\barray\b/gi,
      /\bobject\b/gi,
      /\bfield\b/gi,
      /\bsection\b/gi,
      /\bstructure\b/gi,
      /\bstructured\b/gi,
      /\bformat\b/gi,
      /\bformatted\b/gi,
      /\bcode\b/gi,
      /\bquoted\b/gi,
      /\bidentifier\b/gi,
      /\bkey\b/gi,
      /\bvalue\b/gi,
      /\bproperty\b/gi,
      /\battribute\b/gi,
      /\belement\b/gi,
      /\bpair\b/gi,
    ];
    
    for (const term of technicalTerms) {
      feedback = feedback.replace(term, '');
    }
    
    // Step 3: Split into sentences and filter out ones containing banned patterns
    const bannedPatterns = [
      /\bjson\b/i,
      /\bformat\b/i,
      /\bstructured\b/i,
      /\bstructure\b/i,
      /\bwell-organized\b/i,
      /\borganized\b/i,
      /\bclear.*organization|organization.*clear/i,
      /\bcontent.*remains|remains.*content/i,
      /\badding.*relevant|relevant.*addition/i,
      /\benhance.*present|present.*enhance/i,
      /\bintroduces.*section|section.*introduces/i,
      /\bclear and well-formatted/i,
      /\bthe.*explanation\b/i,
      /\bthe.*table/i,
      /\bthe.*field/i,
      /\bquoted/i,
    ];
    
    try {
      const sentences = feedback.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
      const filtered = sentences.filter(s => !bannedPatterns.some(pattern => pattern.test(s)));
      feedback = filtered.join(' ').trim();
    } catch (e) {
      // if sentence filtering fails, continue with what we have
    }
    
    // Step 4: Clean up whitespace
    feedback = feedback.replace(/\s+/g, ' ').trim();
    
    // Step 5: Default to simple feedback if everything got cleaned out
    if (!feedback || feedback.length < 10) {
      feedback = 'Good job — your analysis demonstrates understanding of the forensic principles involved.';
    }

    // Replace specimen wording per instructor preference: do not use 'fake specimen'/'real specimen'
    try {
      feedback = feedback
        .replace(/\bfake specimen\b/gi, 'it is not written by the same person')
        .replace(/\breal specimen\b/gi, 'it is written by the same person')
        .replace(/\bnot a match\b/gi, 'it is not written by the same person')
        .replace(/\bnon[- ]?matching\b/gi, 'it is not written by the same person')
        .replace(/\bforgery\b/gi, 'it is not written by the same person')
        .replace(/\bforged\b/gi, 'it is not written by the same person')
        .replace(/\bsame writer\b/gi, 'it is written by the same person')
        .replace(/\bsame person\b/gi, 'it is written by the same person')
        .replace(/\bgenuine specimen\b/gi, 'it is written by the same person');
    } catch (e) {
      // ignore replacement errors
    }

    try {
      await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response, api_key_index) VALUES (${studentId}, ${examId}, ${overall}, ${accuracy}, ${completeness}, ${clarity}, ${objectivity}, ${feedback}, ${text}, ${keyIndex})`;
    } catch (dbErr) {
      console.error('[GRADER] Failed to save AI grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
    }

    // Mark successful usage of the key
    try {
      if (keyIndex != null) apiKeyManager.markRequest(keyIndex);
    } catch (e) {}

    console.log('[GRADER] Grading complete for', studentId, examId, 'score:', overall);

    return { score: overall, feedback };
  } catch (err) {
    // If the API call never succeeded (network/auth failure), allow the safe fallbacks.
    // If the API call DID succeed but we hit a parsing/processing error, do NOT run the network fallback
    // because the model returned something but we couldn't parse it — that should be handled separately.
    if (!apiCallSucceeded) {
      // Attempt safe fallback: if student's findings exactly match teacher's findings (normalized),
    // award full marks so students don't get penalized for API/network failures.
    try {
      const normalize = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const tNorm = normalize(teacherFindings);
      const sNorm = normalize(studentFindings);
      if (tNorm && sNorm) {
        if (tNorm === sNorm) {
          const fallbackAccuracy = 100;
          const fallbackCompleteness = 100;
          const fallbackClarity = 95;
          const fallbackObjectivity = 100;
          const fallbackOverall = Math.round((fallbackAccuracy * (rubricWeights.accuracy || 0) + fallbackCompleteness * (rubricWeights.completeness || 0) + fallbackClarity * (rubricWeights.clarity || 0) + fallbackObjectivity * (rubricWeights.objectivity || 0)) / ((rubricWeights.accuracy || 0) + (rubricWeights.completeness || 0) + (rubricWeights.clarity || 0) + (rubricWeights.objectivity || 0)));
          const fallbackFeedback = 'Student findings match the teacher\'s findings exactly. Full marks awarded.';
          try {
            await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response, api_key_index) VALUES (${studentId}, ${examId}, ${fallbackOverall}, ${fallbackAccuracy}, ${fallbackCompleteness}, ${fallbackClarity}, ${fallbackObjectivity}, ${fallbackFeedback}, ${String(err && err.message ? err.message : err)}, ${null})`;
          } catch (dbErr) {
            console.error('[GRADER] Failed to save fallback AI grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
          }
          console.log('[GRADER] Fallback grading applied for', studentId, examId, 'score:', fallbackOverall);
          return { score: fallbackOverall, feedback: fallbackFeedback };
        }

        // Fuzzy similarity fallback: if not exact but substantially similar, award a proportional provisional score
        const tokenize = (s) => {
          return Array.from(new Set(String(s).toLowerCase().split(/\W+/).filter(Boolean)));
        };
        const tTokens = tokenize(tNorm);
        const sTokens = tokenize(sNorm);
        const tSet = new Set(tTokens);
        const sSet = new Set(sTokens);
        const intersection = sTokens.filter((w) => tSet.has(w)).length;
        const unionSize = new Set([...tTokens, ...sTokens]).size || 1;
        const similarity = intersection / unionSize; // 0..1

        if (similarity >= 0.9) {
          // nearly identical -> full marks
          const fallbackAccuracy = 100;
          const fallbackCompleteness = 100;
          const fallbackClarity = 95;
          const fallbackObjectivity = 100;
          const fallbackOverall = Math.round((fallbackAccuracy * (rubricWeights.accuracy || 0) + fallbackCompleteness * (rubricWeights.completeness || 0) + fallbackClarity * (rubricWeights.clarity || 0) + fallbackObjectivity * (rubricWeights.objectivity || 0)) / ((rubricWeights.accuracy || 0) + (rubricWeights.completeness || 0) + (rubricWeights.clarity || 0) + (rubricWeights.objectivity || 0)));
          const fallbackFeedback = 'Student findings are nearly identical to the teacher\'s findings. Full marks awarded.';
          try {
            await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response, api_key_index) VALUES (${studentId}, ${examId}, ${fallbackOverall}, ${fallbackAccuracy}, ${fallbackCompleteness}, ${fallbackClarity}, ${fallbackObjectivity}, ${fallbackFeedback}, ${String(err && err.message ? err.message : err)}, ${null})`;
          } catch (dbErr) {
            console.error('[GRADER] Failed to save fallback AI grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
          }
          console.log('[GRADER] Fuzzy fallback (>=0.9) applied for', studentId, examId, 'score:', fallbackOverall, 'similarity:', similarity);
          return { score: fallbackOverall, feedback: fallbackFeedback };
        }

        if (similarity >= 0.6) {
          // partial match -> award proportional scores
          const fallbackAccuracy = Math.round(100 * similarity);
          const fallbackCompleteness = Math.round(100 * similarity);
          const fallbackClarity = Math.round(85 * similarity) + 10; // bias clarity slightly higher
          const fallbackObjectivity = 100;
          const totalW = (rubricWeights.accuracy || 0) + (rubricWeights.completeness || 0) + (rubricWeights.clarity || 0) + (rubricWeights.objectivity || 0) || 100;
          const fallbackOverall = Math.round((fallbackAccuracy * (rubricWeights.accuracy || 0) + fallbackCompleteness * (rubricWeights.completeness || 0) + fallbackClarity * (rubricWeights.clarity || 0) + fallbackObjectivity * (rubricWeights.objectivity || 0)) / totalW);
          const fallbackFeedback = `Student findings partially match the teacher's findings. Provisional score awarded due to service outage. Similarity: ${Math.round(similarity*100)}%.`;
          try {
            await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response, api_key_index) VALUES (${studentId}, ${examId}, ${fallbackOverall}, ${fallbackAccuracy}, ${fallbackCompleteness}, ${fallbackClarity}, ${fallbackObjectivity}, ${fallbackFeedback}, ${String(err && err.message ? err.message : err)}, ${null})`;
          } catch (dbErr) {
            console.error('[GRADER] Failed to save fuzzy fallback AI grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
          }
          console.log('[GRADER] Fuzzy fallback (>=0.6) applied for', studentId, examId, 'score:', fallbackOverall, 'similarity:', similarity);
          return { score: fallbackOverall, feedback: fallbackFeedback };
        }
      }
    } catch (fallbackErr) {
      console.error('[GRADER] Fallback grading error:', fallbackErr && fallbackErr.message ? fallbackErr.message : fallbackErr);
    }

      console.error('[GRADER] Error calling Gemini:', err && err.message ? err.message : err, err && err.stack ? err.stack : 'no-stack');
      try {
        await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, feedback, raw_response, api_key_index) VALUES (${studentId}, ${examId}, ${0}, ${String(err && err.message ? err.message : err)}, ${String(err && err.stack ? err.stack : '')}, ${null})`;
      } catch (dbErr) {
        console.error('[GRADER] Failed to save error grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
      }
      throw err;
    }

    // API call succeeded but we hit a processing/parsing error. Log details and save a failed grade (no fallback).
    console.error('[GRADER] Parsing/processing error after successful API call:', err && err.message ? err.message : err, err && err.stack ? err.stack : 'no-stack');
    try {
      await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, feedback, raw_response, api_key_index) VALUES (${studentId}, ${examId}, ${0}, ${String('Parsing or processing error')}, ${String(err && err.stack ? err.stack : '')}, ${keyIndex})`;
    } catch (dbErr) {
      console.error('[GRADER] Failed to save parsing error grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
    }
    throw err;
  }
}

/**
 * ⚠️ DEPRECATED: enqueueGrade is no longer used
 * Jobs are now queued directly in the ai_queue table via /api/ai-grader/submit
 * The ai-worker.js processes them with intelligent concurrency (6 workers, 8 RPM per key)
 */
function enqueueGrade(studentId, examId, teacherFindings, studentFindings) {
  console.warn('[GRADER] enqueueGrade is deprecated. Use POST /api/ai-grader/submit instead.');
}

module.exports = { gradeStudent, enqueueGrade };
