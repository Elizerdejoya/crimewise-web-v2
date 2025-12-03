const db = require('./db');
const GeminiQueue = require('./geminiQueue');
const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function gradeStudent(studentId, examId, teacherFindings, studentFindings) {
  console.log('[GRADER] Scheduling grading for student', studentId, 'exam', examId);
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

CRITICAL RULE: If the student's findings are IDENTICAL or NEARLY IDENTICAL to the teacher's answer key, assign 100 to ALL components (accuracy, completeness, clarity, objectivity). A perfect match to the answer key earns a perfect overall score of 100.

Grading criteria (importance):
1. Accuracy (${rubricWeights.accuracy}%) - How well the student's findings match the teacher's findings. If the student's findings EXACTLY MATCH the teacher's answer key, give 100. Deduct points only if there are missing details or incorrect information.
2. Completeness (${rubricWeights.completeness}%) - Whether the student covered all the important points from the answer key. If all major points from the answer key match, give 100.
3. Clarity (${rubricWeights.clarity}%) - Whether the writing is clear and easy to understand. If the explanation is understandable, give 100. Only deduct if confusing.
4. Objectivity (${rubricWeights.objectivity}%) - Whether the student stayed objective and did not add personal opinions or interpretations. If no bias detected, give 100.

** VERY IMPORTANT: Your feedback MUST be written in SIMPLE, CLEAR language that criminology students can understand. DO NOT use technical programming terms, code references, JSON terminology, or technical jargon. Write as if explaining to a fellow student. **

CRITICAL SCORING RULE: If the student's findings match the teacher's findings with no errors or omissions, the accuracy score MUST be 100. Do not arbitrarily reduce correct answers.

DO NOT reference or mention any internal labels, field names, keys, or data structure terms from the student's response. For example, never say 'the "explanation" field', 'tableAnswers', 'the JSON format', or any quoted identifiers. If the student includes extra sections, tables, or data points, comment only on their relevance or usefulness in plain language (for example: 'You added extra data that doesn't change the main conclusion'), but do NOT name or describe the section or format.

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
  "feedback": "Write in simple, clear language what the student did well, what they missed, and why this score was given. DO NOT reference or quote any field names, section titles, or data structure terms in the feedback. For example: 'You correctly identified the handwriting slant and baseline characteristics. However, you missed the discussion of pen pressure variations. Your explanation was clear and well-organized. You stayed objective throughout your analysis.'"
}

NEVER include technical references like JSON structures, code formatting, arrays, quoted identifiers, or programming concepts in the feedback.`;

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[GRADER] Warning: GEMINI_API_KEY is not set in the environment. Gemini requests will likely fail.');
    }

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
        console.error(`[GRADER] Gemini call failed (attempt ${attempt}):`, callErr && callErr.message ? callErr.message : callErr);
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
    
    // Clean up feedback to remove any accidental technical terms or quoted identifiers the AI might have included
    feedback = feedback
      .replace(/\bjson\b/gi, '')
      .replace(/\btableAnswers\b/gi, '')
      .replace(/\btable\b/gi, '')
      .replace(/\bconclusion\b/gi, '')
      .replace(/\broot\b/gi, '')
      .replace(/\bratio\b/gi, '')
      .replace(/\bexplanation\b/gi, '')
      .replace(/\barray\b/gi, '')
      .replace(/\bobject\b/gi, '')
      .replace(/\bfield\b/gi, '')
      .replace(/\bsection\b/gi, '')
      .replace(/\bstructure\b/gi, '')
      .replace(/\bformat\b/gi, '')
      .replace(/\bcode\b/gi, '')
      // remove quoted identifiers like 'explanation' or "tableAnswers"
      .replace(/['"][a-zA-Z0-9_]+['"]/g, '')
      .replace(/`/g, '')
      .replace(/\{\s*\}/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/  +/g, ' ')
      .trim();

    // Remove ANY sentences containing quoted identifiers or technical/format terms
    try {
      // First, remove all quoted identifiers like 'explanation', "tableAnswers", 'root', etc.
      feedback = feedback.replace(/['"][^'"]*['"][,\.\s]?/g, ' ');
      
      // Then filter out sentences with banned patterns
      const bannedPatterns = [
        /\bjson\b/i,
        /\bformat\b/i,
        /\bstructured\b/i,
        /\bstructure\b/i,
        /\borganized\b/i,
        /\bwell-structured\b/i,
        /clarity.*organization|organization.*clarity/i,
        /content remains objective/i,
        /adding relevant structural/i,
        /enhance.*presentation/i,
        /section introduces/i
      ];
      
      // Split into sentences
      const sentences = feedback.split(/(?<=[.!?])\s+/).filter(s => s.trim());
      const filtered = sentences.filter(s => !bannedPatterns.some(pattern => pattern.test(s)));
      feedback = filtered.join(' ').trim();
      
      // Clean up multiple spaces
      feedback = feedback.replace(/\s+/g, ' ').trim();
      
      if (!feedback) feedback = 'Good job — your findings are clear and match the key points.';
    } catch (e) {
      // if sentence filtering fails for any reason, keep the cleaned feedback
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
      await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response) VALUES (${studentId}, ${examId}, ${overall}, ${accuracy}, ${completeness}, ${clarity}, ${objectivity}, ${feedback}, ${text})`;
    } catch (dbErr) {
      console.error('[GRADER] Failed to save AI grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
    }

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
            await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response) VALUES (${studentId}, ${examId}, ${fallbackOverall}, ${fallbackAccuracy}, ${fallbackCompleteness}, ${fallbackClarity}, ${fallbackObjectivity}, ${fallbackFeedback}, ${String(err && err.message ? err.message : err)})`;
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
            await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response) VALUES (${studentId}, ${examId}, ${fallbackOverall}, ${fallbackAccuracy}, ${fallbackCompleteness}, ${fallbackClarity}, ${fallbackObjectivity}, ${fallbackFeedback}, ${String(err && err.message ? err.message : err)})`;
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
            await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, accuracy, completeness, clarity, objectivity, feedback, raw_response) VALUES (${studentId}, ${examId}, ${fallbackOverall}, ${fallbackAccuracy}, ${fallbackCompleteness}, ${fallbackClarity}, ${fallbackObjectivity}, ${fallbackFeedback}, ${String(err && err.message ? err.message : err)})`;
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
        await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, feedback, raw_response) VALUES (${studentId}, ${examId}, ${0}, ${String(err && err.message ? err.message : err)}, ${String(err && err.stack ? err.stack : '')})`;
      } catch (dbErr) {
        console.error('[GRADER] Failed to save error grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
      }
      throw err;
    }

    // API call succeeded but we hit a processing/parsing error. Log details and save a failed grade (no fallback).
    console.error('[GRADER] Parsing/processing error after successful API call:', err && err.message ? err.message : err, err && err.stack ? err.stack : 'no-stack');
    try {
      await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, feedback, raw_response) VALUES (${studentId}, ${examId}, ${0}, ${String('Parsing or processing error')}, ${String(err && err.stack ? err.stack : '')})`;
    } catch (dbErr) {
      console.error('[GRADER] Failed to save parsing error grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
    }
    throw err;
  }
}

function enqueueGrade(studentId, examId, teacherFindings, studentFindings) {
  GeminiQueue.add(() => gradeStudent(studentId, examId, teacherFindings, studentFindings));
}

module.exports = { gradeStudent, enqueueGrade };
