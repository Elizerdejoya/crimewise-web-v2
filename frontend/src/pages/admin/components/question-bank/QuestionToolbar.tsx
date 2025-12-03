import React from 'react';
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Edit2,
  Trash2,
  Copy,
  Printer,
  FileSpreadsheet,
  FileText,
  FilePlus2
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import topLogo from '@/assets/top-logo.png';
import bottomLogo from '@/assets/bottom-logo.png';
import { useToast } from "@/hooks/use-toast";

interface QuestionToolbarProps {
  onAddQuestion: () => void;
  onReload: () => void;
  onEdit: () => void;
  onDelete: () => void;
  selectedIds: number[];
  questions: any[];
}

const QuestionToolbar: React.FC<QuestionToolbarProps> = ({
  onAddQuestion,
  onReload,
  onEdit,
  onDelete,
  selectedIds,
  questions
}) => {
  const { toast } = useToast();

  // Copy selected questions to clipboard
  const handleCopy = () => {
    if (selectedIds.length === 0) return;
    
    const rows = questions.filter(q => selectedIds.includes(q.id));
    const text = rows.map(r => `${r.id}\t${r.title}\t${r.course}\t${r.difficulty}`).join("\n");
    navigator.clipboard.writeText(text);
    
    toast({ 
      title: "Copied", 
      description: "Selected questions copied to clipboard." 
    });
  };

  // Helper: load image URL into PNG data URL for jsPDF
  const loadImageToDataUrl = async (src: string) => {
    return new Promise<{ dataUrl: string; w: number; h: number }>((resolve, reject) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Failed to get canvas context'));
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ dataUrl, w: img.naturalWidth, h: img.naturalHeight });
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = (e) => reject(e);
        try { img.src = new URL(src, window.location.href).href; } catch { img.src = src; }
      } catch (err) {
        reject(err);
      }
    });
  };
  
  // Export selected questions to Excel
  const handleExcel = () => {
    if (selectedIds.length === 0) return;
    
    const rows = questions.filter(q => selectedIds.includes(q.id));
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ 
      ID: r.id, 
      Title: r.title, 
      Type: r.type, 
      Course: r.course, 
      Difficulty: r.difficulty,
      CreatedBy: r.created_by,
      Created: r.created 
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "questions.xlsx");
    
    toast({ 
      title: "Excel Exported", 
      description: "Excel file downloaded." 
    });
  };
  
  // Export selected questions to PDF (embed top/bottom logos)
  const handlePDF = async () => {
    if (selectedIds.length === 0) return;

    const rows = questions.filter(q => selectedIds.includes(q.id));
    const doc = new jsPDF();

    // Try to load and add top logo
    try {
      const topImg = await loadImageToDataUrl(new URL(topLogo, window.location.href).href).catch(() => null);
      if (topImg) {
        const { dataUrl, w, h } = topImg;
        const dispW = 60; // mm
        const dispH = (h / w) * dispW;
        const pageW = doc.internal.pageSize.getWidth();
        const x = (pageW - dispW) / 2;
        doc.addImage(dataUrl, 'PNG', x, 8, dispW, dispH);
        // push down startY
        autoTable(doc, {
          head: [["ID", "Title", "Type", "Course", "Difficulty", "Created By"]],
          body: rows.map(r => [r.id, r.title, r.type, r.course, r.difficulty, r.created_by]),
          startY: 22 + dispH,
        });
      } else {
        doc.text("Question Bank List", 14, 16);
        autoTable(doc, {
          head: [["ID", "Title", "Type", "Course", "Difficulty", "Created By"]],
          body: rows.map(r => [r.id, r.title, r.type, r.course, r.difficulty, r.created_by]),
          startY: 22,
        });
      }
    } catch (e) {
      // fallback to simple table
      doc.text("Question Bank List", 14, 16);
      autoTable(doc, {
        head: [["ID", "Title", "Type", "Course", "Difficulty", "Created By"]],
        body: rows.map(r => [r.id, r.title, r.type, r.course, r.difficulty, r.created_by]),
        startY: 22,
      });
    }

    // Add bottom logo to every page if available
    try {
      const botImg = await loadImageToDataUrl(new URL(bottomLogo, window.location.href).href).catch(() => null);
      if (botImg) {
        const { dataUrl, w, h } = botImg;
        const dispW = 60;
        const dispH = (h / w) * dispW;
        const pageW = doc.internal.pageSize.getWidth();
        const x = (pageW - dispW) / 2;
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          const pageH = doc.internal.pageSize.getHeight();
          doc.addImage(dataUrl, 'PNG', x, pageH - dispH - 8, dispW, dispH);
        }
      }
    } catch (e) {
      // ignore
    }

    doc.save("questions.pdf");

    toast({ 
      title: "PDF Exported", 
      description: "PDF file downloaded." 
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={onAddQuestion}>
          <FilePlus2 className="mr-1 h-4 w-4" /> Add Question
        </Button>
        <Button size="sm" variant="outline" onClick={onReload}>
          <RefreshCw className="mr-1 h-4 w-4" /> Reload
        </Button>
      </div>
      <div className="flex gap-2">
        <Button 
          size="sm" 
          onClick={onEdit} 
          disabled={selectedIds.length !== 1}
        >
          <Edit2 className="mr-1 h-4 w-4" /> Edit
        </Button>
        <Button 
          size="sm" 
          variant="destructive" 
          onClick={onDelete} 
          disabled={selectedIds.length === 0}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>
      <div className="flex gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleCopy} 
          disabled={selectedIds.length === 0}
        >
          <Copy className="mr-1 h-4 w-4" /> Copy
        </Button>
        
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleExcel} 
          disabled={selectedIds.length === 0}
        >
          <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handlePDF} 
          disabled={selectedIds.length === 0}
        >
          <FileText className="mr-1 h-4 w-4" /> PDF
        </Button>
      </div>
    </div>
  );
};

export default QuestionToolbar;
