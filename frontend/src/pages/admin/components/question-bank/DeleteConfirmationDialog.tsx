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
      () => {
        toast({ 
          title: "Questions Deleted", 
          description: `${selectedIds.length} question(s) deleted successfully.` 
        });
        onOpenChange(false);
        onDelete();
      },
      (err) => {
        toast({ 
          title: "Error", 
          description: err.error || "Failed to delete questions.", 
          variant: "destructive" 
        });
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