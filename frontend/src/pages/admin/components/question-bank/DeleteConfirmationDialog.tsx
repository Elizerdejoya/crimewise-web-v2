import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "@/components/ui/alert-dialog";
import { deleteQuestions } from "./utils";
import { useToast } from "@/hooks/use-toast";

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedIds: number[];
  onDelete: () => void;
}

const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  isOpen,
  onOpenChange,
  selectedIds,
  onDelete
}) => {
  const { toast } = useToast();

  const confirmDelete = async () => {
    if (selectedIds.length === 0) return;
    
    deleteQuestions(
      selectedIds,
      (result) => {
        toast({ 
          title: "Success", 
          description: `${selectedIds.length} question(s) deleted successfully.` 
        });
        onOpenChange(false);
        onDelete();
      },
      (err: any) => {
        console.log("Delete error details:", err);
        
        // Check if this is a constraint error with partial deletion
        if (err.constraintErrors && err.constraintErrors.length > 0) {
          // Build message showing question names and which exams they are used in
          const details = err.constraintErrors
            .map((ce: any) => {
              const questionName = ce.questionName || `Question ${ce.id}`;
              
              if (ce.referencingExams && Array.isArray(ce.referencingExams) && ce.referencingExams.length > 0) {
                const examList = ce.referencingExams
                  .map((e: any) => e.name || `Exam ${e.id}`)
                  .join(", ");
                return `"${questionName}" is used in: ${examList}`;
              }
              return `"${questionName}"`;
            })
            .join("\n");

          const description = `${err.constraintErrors.length} question(s) cannot be deleted because they are being used in exams:\n\n${details}\n\nRemove them from the exams first to delete them.`;

          toast({ 
            title: "Cannot Delete Questions", 
            description: description, 
            variant: "destructive" 
          });
          // Still reload since some were deleted
          onOpenChange(false);
          onDelete();
        } else if (err.errors && err.errors.length > 0) {
          // Handle errors - simplify the message
          const errorList = err.errors
            .map((e: any) => `Question ${e.id}`)
            .join(", ");
          
          toast({ 
            title: "Cannot Delete Questions", 
            description: `${err.errors.length} question(s) could not be deleted: ${errorList}. They are being used in exams.`, 
            variant: "destructive" 
          });
          // Still reload since some were deleted
          if (err.deletedCount > 0) {
            onOpenChange(false);
            onDelete();
          }
        } else {
          toast({ 
            title: "Cannot Delete Questions", 
            description: "These questions cannot be deleted because they are being used in exams. Remove them from exams first.", 
            variant: "destructive" 
          });
        }
      }
    );
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Question{selectedIds.length > 1 ? 's' : ''}?</AlertDialogTitle>
        </AlertDialogHeader>
        <div>
          Are you sure you want to delete {selectedIds.length} selected question{selectedIds.length > 1 ? 's' : ''}? This action cannot be undone.
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteConfirmationDialog;