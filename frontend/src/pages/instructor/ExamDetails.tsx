import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from "@/lib/config";
import Loading from "@/components/ui/Loading";

const ExamDetails = () => {
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
    });
  }, [examId]);

  if (loading) return <Loading fullScreen message="Loading exam details..." />;
  if (!exam) return <div className="p-8">Exam not found.</div>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Exam Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <strong>Name:</strong> {exam.name}<br />
              <strong>Token:</strong> <span className="font-mono">{exam.token}</span><br />
              <strong>Start:</strong> {exam.start}<br />
              <strong>End:</strong> {exam.end}<br />
              <strong>Duration:</strong> {exam.duration}
            </div>
            <div className="mb-4">
              <strong>Participants:</strong> {results?.participants ?? '-'}<br />
              <strong>Average Score:</strong> {results?.avgScore ?? '-'}<br />
              <strong>Total Item Score:</strong> {results?.totalItemScore ?? exam?.points ?? '-'}
            </div>
            <div>
              <strong>Results:</strong>
              <table className="w-full mt-2 border">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Student</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Score</th>
                    <th className="p-2 text-left">Tab Switches</th>
                    <th className="p-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {results?.results?.length > 0 ? results.results.map((r: any) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{r.student_name}</td>
                      <td className="p-2">{r.student_email}</td>
                      <td className="p-2">{r.score}</td>
                      <td className="p-2">{r.tab_switches ?? '-'}</td>
                      <td className="p-2">{r.date}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="text-center p-2">No results</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ExamDetails;
