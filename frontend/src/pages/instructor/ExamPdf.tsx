import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE_URL } from "@/lib/config";
import Loading from "@/components/ui/Loading";

const ExamPdf = () => {
  const { examId } = useParams();
  const [exam, setExam] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!examId) return;
    Promise.all([
      fetch(`${API_BASE_URL}/api/exams/${examId}`).then(res => res.json()),
      fetch(`${API_BASE_URL}/api/exams/results/${examId}`).then(res => res.json()),
    ]).then(([examData, resultsData]) => {
      setExam(examData);
      setResults(resultsData);
      setLoading(false);
      setTimeout(() => window.print(), 500);
    });
  }, [examId]);

  if (loading) return <Loading fullScreen message="Preparing PDF..." />;
  if (!exam) return <div className="p-8">Exam not found.</div>;

  return (
    <div className="p-8 print:p-0">
      <h1 className="text-2xl font-bold mb-2">Exam Report</h1>
      <div className="mb-2"><strong>Name:</strong> {exam.name}</div>
      <div className="mb-2"><strong>Token:</strong> <span className="font-mono">{exam.token}</span></div>
      <div className="mb-2"><strong>Start:</strong> {exam.start}</div>
      <div className="mb-2"><strong>End:</strong> {exam.end}</div>
      <div className="mb-2"><strong>Duration:</strong> {exam.duration}</div>
      <div className="mb-2"><strong>Participants:</strong> {results?.participants ?? '-'}</div>
      <div className="mb-2"><strong>Average Score:</strong> {results?.avgScore ?? '-'}</div>
      <div className="mt-4">
        <strong>Results:</strong>
        <table className="w-full mt-2 border">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left">Student</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Score</th>
              <th className="p-2 text-left">Date</th>
              {exam.question_type === 'forensic' ? <th className="p-2 text-left">Raw Score</th> : null}
              {exam.question_type === 'forensic' ? <th className="p-2 text-left">Raw Total</th> : null}
              {exam.question_type === 'forensic' ? <th className="p-2 text-left">Conclusion</th> : null}
            </tr>
          </thead>
          <tbody>
            {results?.results?.length > 0 ? results.results.map((r: any) => {
              // Calculate raw scores and conclusion for forensic questions
              let rawScore = '';
              let rawTotal = '';
              let studentConclusion = '';
              let expectedConclusion = '';
              let conclusionMatch = false;

              if (exam.question_type === 'forensic' && exam.answer_key) {
                let parsedAnswer = [];
                let parsedKey = [];
                let columns = [];

                try {
                  // Parse student answer
                  if (r.answer) {
                    const rawAnswer = JSON.parse(r.answer);
                    parsedAnswer = rawAnswer.tableAnswers || rawAnswer;
                    if (rawAnswer.conclusion) {
                      studentConclusion = rawAnswer.conclusion;
                    }
                  }

                  // Parse answer key
                  if (exam.answer_key) {
                    const rawKey = JSON.parse(exam.answer_key);
                    if (rawKey.specimens && Array.isArray(rawKey.specimens)) {
                      parsedKey = rawKey.specimens;
                    } else if (Array.isArray(rawKey)) {
                      parsedKey = rawKey;
                    }

                    if (rawKey.explanation && rawKey.explanation.conclusion) {
                      expectedConclusion = rawKey.explanation.conclusion;
                    }
                  }

                  columns = parsedKey.length > 0
                    ? Object.keys(parsedKey[0]).filter(k => !['points', 'id', 'rowId'].includes(k))
                    : [];

                  let correctCount = 0;
                  let totalCount = parsedKey.length * columns.length;

                  parsedKey.forEach((row: any, rowIdx: number) => {
                    columns.forEach((col: string) => {
                      const studentAns = (parsedAnswer[rowIdx]?.[col] || "").toString().trim().toLowerCase();
                      const correctAns = (row[col] || "").toString().trim().toLowerCase();
                      if (studentAns === correctAns) {
                        correctCount++;
                      }
                    });
                  });

                  rawScore = correctCount.toString();
                  rawTotal = totalCount.toString();
                  conclusionMatch = studentConclusion && expectedConclusion && studentConclusion === expectedConclusion;
                } catch (e) {
                  rawScore = '-';
                  rawTotal = '-';
                }
              }

              return (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.student_name}</td>
                  <td className="p-2">{r.student_email}</td>
                  <td className="p-2">{r.score}</td>
                  <td className="p-2">{r.date}</td>
                  {exam.question_type === 'forensic' ? <td className="p-2">{rawScore}</td> : null}
                  {exam.question_type === 'forensic' ? <td className="p-2">{rawTotal}</td> : null}
                  {exam.question_type === 'forensic' ? (
                    <td className="p-2" style={{ color: conclusionMatch ? 'green' : (studentConclusion && expectedConclusion ? 'red' : 'black') }}>
                      {studentConclusion ? `${studentConclusion.charAt(0).toUpperCase() + studentConclusion.slice(1)} ${conclusionMatch ? '✓' : (expectedConclusion ? '✗' : '')}` : '-'}
                    </td>
                  ) : null}
                </tr>
              );
            }) : (
              <tr><td colSpan={exam.question_type === 'forensic' ? 7 : 4} className="text-center p-2">No results</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-8 text-center print:hidden">
        <button onClick={() => window.print()} className="bg-primary text-white px-4 py-2 rounded">Print</button>
      </div>
    </div>
  );
};

export default ExamPdf;
