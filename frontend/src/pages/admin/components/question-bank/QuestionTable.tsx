import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Image, ArrowUp, ArrowDown, Edit, Eye, Trash, Tags } from "lucide-react";

// Format date to readable format
const formatDate = (dateString: string): string => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateString;
  }
};

interface QuestionTableProps {
  questions: any[];
  selectedIds: number[];
  toggleSelectRow: (id: number) => void;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  toggleSelectAll: () => void;
  sortBy: 'title' | 'id' | 'type' | 'course' | 'difficulty' | 'created_by' | 'created' | null;
  sortOrder: 'asc' | 'desc';
  handleSort: (column: 'title' | 'id' | 'type' | 'course' | 'difficulty' | 'created_by' | 'created') => void;
  handleEdit: (question: any) => void;
  handleView: (question: any) => void;
  handleDelete: (question: any) => void;
  questionType?: string; // Optional filter by question type
}

const QuestionTable: React.FC<QuestionTableProps> = ({
  questions,
  selectedIds,
  toggleSelectRow,
  isAllSelected,
  isIndeterminate,
  toggleSelectAll,
  sortBy,
  sortOrder,
  handleSort,
  handleEdit,
  handleView,
  handleDelete,
  questionType
}) => {
  // Filter questions by type if specified
  const displayQuestions = questionType 
    ? questions.filter(q => q.type === questionType)
    : questions;


  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <input 
                type="checkbox" 
                checked={isAllSelected} 
                ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                onChange={toggleSelectAll}
              />
            </TableHead>
            {!questionType && (
              <TableHead className="w-12">ID</TableHead>
            )}
            <TableHead>
              Title
              <Button 
                variant="ghost" 
                size="icon" 
                className="ml-1 p-0 h-4 w-4 align-middle" 
                onClick={() => handleSort('title')}
              >
                {sortOrder === 'asc' && sortBy === 'title' ? 
                  <ArrowUp className="h-3 w-3" /> : 
                  <ArrowDown className="h-3 w-3" />}
              </Button>
            </TableHead>
            {!questionType && (
              <TableHead>
                Type
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="ml-1 p-0 h-4 w-4 align-middle" 
                  onClick={() => handleSort('type')}
                >
                  {sortOrder === 'asc' && sortBy === 'type' ? 
                    <ArrowUp className="h-3 w-3" /> : 
                    <ArrowDown className="h-3 w-3" />}
                </Button>
              </TableHead>
            )}
            <TableHead>
              Course
              <Button 
                variant="ghost" 
                size="icon" 
                className="ml-1 p-0 h-4 w-4 align-middle" 
                onClick={() => handleSort('course')}
              >
                {sortOrder === 'asc' && sortBy === 'course' ? 
                  <ArrowUp className="h-3 w-3" /> : 
                  <ArrowDown className="h-3 w-3" />}
              </Button>
            </TableHead>
            <TableHead>
              Difficulty
              <Button 
                variant="ghost" 
                size="icon" 
                className="ml-1 p-0 h-4 w-4 align-middle" 
                onClick={() => handleSort('difficulty')}
              >
                {sortOrder === 'asc' && sortBy === 'difficulty' ? 
                  <ArrowUp className="h-3 w-3" /> : 
                  <ArrowDown className="h-3 w-3" />}
              </Button>
            </TableHead>
            <TableHead>
              Created By
              <Button 
                variant="ghost" 
                size="icon" 
                className="ml-1 p-0 h-4 w-4 align-middle" 
                onClick={() => handleSort('created_by')}
              >
                {sortOrder === 'asc' && sortBy === 'created_by' ? 
                  <ArrowUp className="h-3 w-3" /> : 
                  <ArrowDown className="h-3 w-3" />}
              </Button>
            </TableHead>
            <TableHead>
              Created Date
              <Button 
                variant="ghost" 
                size="icon" 
                className="ml-1 p-0 h-4 w-4 align-middle" 
                onClick={() => handleSort('created')}
              >
                {sortOrder === 'asc' && sortBy === 'created' ? 
                  <ArrowUp className="h-3 w-3" /> : 
                  <ArrowDown className="h-3 w-3" />}
              </Button>
            </TableHead>
            <TableHead>Keyword Pool</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayQuestions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={questionType ? 8 : 9} className="text-center py-8">
                No questions found.
              </TableCell>
            </TableRow>
          ) : (
            displayQuestions.map((question) => (
              <TableRow 
                key={question.id} 
                className={selectedIds.includes(question.id) ? "bg-muted" : ""}
              >
                <TableCell>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(question.id)} 
                    onChange={() => toggleSelectRow(question.id)} 
                  />
                </TableCell>
                {!questionType && (
                  <TableCell>{question.id}</TableCell>
                )}
                <TableCell>{question.title}</TableCell>
                {!questionType && (
                  <TableCell>
                    <span className="flex items-center">
                      <FileText className="mr-1 h-4 w-4" /> Forensic Doc
                    </span>
                  </TableCell>
                )}
                <TableCell>{question.course}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs font-medium
                    ${question.difficulty === "easy" ? "bg-green-100 text-green-800" : ""}
                    ${question.difficulty === "medium" ? "bg-blue-100 text-blue-800" : ""}
                    ${question.difficulty === "hard" ? "bg-orange-100 text-orange-800" : ""}
                    ${question.difficulty === "expert" ? "bg-red-100 text-red-800" : ""}
                  `}>
                    {question.difficulty}
                  </span>
                </TableCell>
                <TableCell>{question.created_by || "System"}</TableCell>
                <TableCell>{formatDate(question.created)}</TableCell>
                <TableCell>
                  {question.keyword_pool_name ? (
                    <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                      <Tags className="h-3 w-3" />
                      {question.keyword_pool_name}
                    </Badge>
                  ) : (
                    <span className="text-gray-400 text-sm">No pool</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(question)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleView(question)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(question)}>
                      <Trash className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default QuestionTable;