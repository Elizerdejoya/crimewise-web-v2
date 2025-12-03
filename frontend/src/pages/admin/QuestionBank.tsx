import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";

// Import modular components
import {
  QuestionTable,
  AddQuestionDialog,
  EditQuestionDialog,
  ViewQuestionDialog,
  DeleteConfirmationDialog,
  QuestionToolbar,
  SearchAndFilter,
  fetchQuestions,
  fetchCourses,
  fetchKeywordPools,
  filterQuestions,
  sortQuestions
} from "./components/question-bank";

const QuestionBank = () => {
  // State
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [keywordPools, setKeywordPools] = useState<any[]>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>("asc");
  const [sortBy, setSortBy] = useState<'title' | 'id' | 'type' | 'course' | 'difficulty' | 'created_by' | 'created' | null>(null);
  const { toast } = useToast();

  // Load initial data
  const loadQuestions = () => {
    fetchQuestions(
      (data) => setQuestions(data),
      (err) => {
        toast({ title: "Error", description: "Failed to fetch questions.", variant: "destructive" });
        console.error("[Questions][Fetch] Error:", err);
      }
    );
  };

  const loadKeywordPools = () => {
    fetchKeywordPools(
      (data) => setKeywordPools(data),
      (err) => {
        toast({ title: "Error", description: "Failed to fetch keyword pools.", variant: "destructive" });
        console.error("[KeywordPools][Fetch] Error:", err);
      }
    );
  };

  useEffect(() => {
    loadQuestions();
    loadKeywordPools();
    fetchCourses(
      (data) => setCourses(data),
      (err) => {
        toast({ title: "Error", description: "Failed to fetch courses.", variant: "destructive" });
        console.error("[Courses][Fetch] Error:", err);
      }
    );
  }, []);

  // Filter and sort questions
  const filteredQuestions = sortQuestions(
    filterQuestions(questions, searchTerm, courseFilter),
    sortBy,
    sortOrder
  );

  // Selection logic
  const isAllSelected = filteredQuestions.length > 0 && filteredQuestions.every(q => selectedIds.includes(q.id));
  const isIndeterminate = selectedIds.length > 0 && !isAllSelected;
  
  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filteredQuestions.map(q => q.id));
  };
  
  const toggleSelectRow = (id: number) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  };
  
  const clearSelection = () => setSelectedIds([]);

  // Toolbar handlers
  const handleReload = () => {
    loadQuestions();
    clearSelection();
    toast({ title: "Refreshed", description: "Question bank has been refreshed." });
  };

  // Question operations
  const handleEdit = () => {
    if (selectedIds.length === 1) {
      const question = questions.find(q => q.id === selectedIds[0]);
      setSelectedQuestion(question);
      setIsEditDialogOpen(true);
    }
  };

  const handleSelectForEdit = (question: any) => {
    setSelectedQuestion(question);
    setIsEditDialogOpen(true);
  };

  const handleView = (question: any) => {
    setSelectedQuestion(question);
    setIsViewDialogOpen(true);
  };

  const handleDelete = (question: any) => {
    setSelectedQuestion(question);
    setSelectedIds([question.id]);
    setIsDeleteDialogOpen(true);
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setIsDeleteDialogOpen(true);
  };

  const handleSort = (column: 'title' | 'id' | 'type' | 'course' | 'difficulty' | 'created_by' | 'created') => {
    if (sortBy === column) {
      setSortOrder(order => order === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Question Bank</h2>
            <p className="text-muted-foreground">
              Manage examination questions across all courses
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <QuestionToolbar
          onAddQuestion={() => setIsAddingQuestion(true)}
          onReload={handleReload}
          onEdit={handleEdit}
          onDelete={handleBulkDelete}
          selectedIds={selectedIds}
          questions={questions}
        />

        {/* Search and Filter */}
        <SearchAndFilter
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          courseFilter={courseFilter}
          setCourseFilter={setCourseFilter}
          courses={courses}
          totalQuestions={questions.length}
          filteredCount={filteredQuestions.length}
        />

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
            <CardDescription>Manage questions in the system</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="forensic" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="forensic">Forensic Document</TabsTrigger>
              </TabsList>

              <TabsContent value="forensic">
                <QuestionTable
                  questions={filteredQuestions}
                  selectedIds={selectedIds}
                  toggleSelectRow={toggleSelectRow}
                  isAllSelected={isAllSelected}
                  isIndeterminate={isIndeterminate}
                  toggleSelectAll={toggleSelectAll}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  handleSort={handleSort}
                  handleEdit={handleSelectForEdit}
                  handleView={handleView}
                  handleDelete={handleDelete}
                  questionType="forensic"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <AddQuestionDialog
        isOpen={isAddingQuestion}
        onOpenChange={setIsAddingQuestion}
        courses={courses}
        onQuestionAdded={loadQuestions}
      />
      
      <EditQuestionDialog
        isOpen={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        question={selectedQuestion}
        courses={courses}
        keywordPools={keywordPools}
        onQuestionUpdated={loadQuestions}
      />
      
      <ViewQuestionDialog
        isOpen={isViewDialogOpen}
        onOpenChange={setIsViewDialogOpen}
        question={selectedQuestion}
      />
      
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        selectedIds={selectedIds}
        onDelete={() => {
          clearSelection();
          loadQuestions();
        }}
      />
    </DashboardLayout>
  );
};

export default QuestionBank;
