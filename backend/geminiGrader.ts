// Use CommonJS require for existing JS db.js module
const db: any = require('./db');
import GeminiQueue from './geminiQueue';
const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface GradeResult {
  score: number; // 0-100
  feedback: string;
}

export async function gradeStudent(
  studentId: number,
  examId: number,
  teacherFindings: string,
  studentFindings: string
): Promise<GradeResult> {
  console.log('[GRADER] Scheduling grading for student', studentId, 'exam', examId);

  // Build the rubric prompt
  const prompt = `You are an expert grader. Compare the student's findings to the teacher's official findings.

Rubrics (weights):
1. Accuracy (40%) - factual match
2. Completeness (30%) - covered relevant points
3. Clarity (20%) - understandable, logical writing
4. Objectivity (10%) - unbiased, evidence-based

Please provide a JSON response with fields: accuracy (0-100), completeness (0-100), clarity (0-100), objectivity (0-100), overall_score (0-100), feedback (short explanation of strengths and weaknesses, and why the numerical score was given).

Teacher findings:
"""
${teacherFindings}
"""

Student findings:
"""
${studentFindings}
"""

Evaluate carefully and return ONLY valid JSON.`;

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: { temperature: 0.0 }
    });

    const text = response.text;
    if (!text) throw new Error('No response from Gemini');

    // Attempt to parse JSON from the model response
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      // Try to extract JSON substring
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        const jsonStr = text.slice(start, end + 1);
        parsed = JSON.parse(jsonStr);
      } else throw err;
    }

    // Compute weighted score if overall_score not provided
    const accuracy = Number(parsed.accuracy ?? 0);
    const completeness = Number(parsed.completeness ?? 0);
    const clarity = Number(parsed.clarity ?? 0);
    const objectivity = Number(parsed.objectivity ?? 0);
    let overall = Number(parsed.overall_score ?? NaN);
    if (Number.isNaN(overall)) {
      overall = Math.round(
        accuracy * 0.4 + completeness * 0.3 + clarity * 0.2 + objectivity * 0.1
      );
    }

    const feedback = String(parsed.feedback ?? (parsed.comments ?? 'No feedback'));

    // Save to database
    try {
      await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, feedback) VALUES (${studentId}, ${examId}, ${overall}, ${feedback})`;
    } catch (dbErr: any) {
      console.error('[GRADER] Failed to save AI grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
    }

    console.log('[GRADER] Grading complete for', studentId, examId, 'score:', overall);

    return { score: overall, feedback };
  } catch (err: any) {
    console.error('[GRADER] Error calling Gemini:', err?.message || err);
    // Save a failed attempt with score 0 and error message
    try {
      await db.sql`INSERT INTO ai_grades (student_id, exam_id, score, feedback) VALUES (${studentId}, ${examId}, ${0}, ${String(err.message ?? err)})`;
    } catch (dbErr: any) {
      console.error('[GRADER] Failed to save error grade:', dbErr && dbErr.message ? dbErr.message : dbErr);
    }
    throw err;
  }
}

export function enqueueGrade(studentId: number, examId: number, teacherFindings: string, studentFindings: string) {
  GeminiQueue.add(() => gradeStudent(studentId, examId, teacherFindings, studentFindings));
}
