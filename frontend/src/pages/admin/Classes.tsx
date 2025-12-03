import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, FilePlus2, RefreshCw, Edit2, Trash2, Copy, Printer, FileSpreadsheet, FileText, ArrowUp, ArrowDown } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_BASE_URL } from "@/lib/config";

// Get current user from localStorage
const getCurrentUser = () => {
  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload;
  } catch (e) {
    return null;
  }
};

// Create auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

const ClassesPage = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddStep1Open, setIsAddStep1Open] = useState(false);
  const [isAddStep2Open, setIsAddStep2Open] = useState(false);
  const [addClassCount, setAddClassCount] = useState(1);
  const [addClassRows, setAddClassRows] = useState<{ id: string; name: string; batch_id: string }[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editRows, setEditRows] = useState<{ id: number; name: string; batch_id: string }[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedRows, setImportedRows] = useState<{ name: string; batch_id: string }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>("asc");
  const [sortBy, setSortBy] = useState<'name' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const currentUser = getCurrentUser();

  // Fetch classes and batches from backend
  useEffect(() => {
    fetchClassesAndBatches();
  }, []);

  const fetchClassesAndBatches = () => {
    // Fetch classes
    fetch(`${API_BASE_URL}/api/classes`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (res.status === 401) {
          toast({
            title: "Authentication Error",
            description: "Please log in again.",
            variant: "destructive",
          });
          return;
        }
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setClasses(data);
        }
      })
      .catch(() => toast({ title: "Error", description: "Failed to fetch classes.", variant: "destructive" }));

    // Fetch batches
    fetch(`${API_BASE_URL}/api/batches`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (res.status === 401) {
          toast({
            title: "Authentication Error",
            description: "Please log in again.",
            variant: "destructive",
          });
          return;
        }
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setBatches(data);
        }
      })
      .catch(() => toast({ title: "Error", description: "Failed to fetch batches.", variant: "destructive" }));
  };

  // Filter and sort classes based on search term and sort order
  let filteredClasses = classes.filter((cls) =>
    (cls.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (batches.find((b: any) => b.id === cls.batch_id)?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  if (sortBy === 'name') {
    filteredClasses = filteredClasses.sort((a, b) => {
      if (sortOrder === 'asc') return (a.name || "").localeCompare(b.name || "");
      else return (b.name || "").localeCompare(a.name || "");
    });
  }

  // Pagination
  const totalClasses = filteredClasses.length;
  const totalPages = Math.max(1, Math.ceil(totalClasses / pageSize));
  if (page > totalPages) setPage(totalPages);
  const paginatedClasses = filteredClasses.slice((page - 1) * pageSize, page * pageSize);
  // Reset to first page on search or pageSize change
  useEffect(() => { setPage(1); }, [searchTerm, pageSize]);

  // Selection logic
  const isAllSelected = filteredClasses.length > 0 && filteredClasses.every(c => selectedIds.includes(c.id));
  const isIndeterminate = selectedIds.length > 0 && !isAllSelected;
  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filteredClasses.map(c => c.id));
  };
  const toggleSelectRow = (id: number) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  };
  const clearSelection = () => setSelectedIds([]);

  // Toolbar button handlers
  const handleReload = () => {
    fetchClassesAndBatches();
    clearSelection();
  };
  const handleCopy = () => {
    if (selectedIds.length === 0) return;
    const rows = classes.filter(c => selectedIds.includes(c.id));
    const text = rows.map(r => `${r.name}\t${batches.find((b: any) => b.id === r.batch_id)?.name || ""}`).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Selected rows copied to clipboard." });
  };
  const handlePrint = () => {
    if (selectedIds.length === 0) return;
    const rows = classes.filter(c => selectedIds.includes(c.id));
    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Classes</title></head><body>');
      printWindow.document.write('<table border="1"><tr><th>Class</th><th>Batch</th></tr>');
      rows.forEach(r => printWindow.document.write(`<tr><td>${r.name}</td><td>${batches.find((b: any) => b.id === r.batch_id)?.name || ""}</td></tr>`));
      printWindow.document.write('</table></body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };
  const handleExcel = () => {
    if (selectedIds.length === 0) return;
    const rows = classes.filter(c => selectedIds.includes(c.id));
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ Class: r.name, Batch: batches.find((b: any) => b.id === r.batch_id)?.name || "" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Classes");
    XLSX.writeFile(wb, "classes.xlsx");
    toast({ title: "Excel Exported", description: "Excel file downloaded." });
  };
  const handlePDF = () => {
    if (selectedIds.length === 0) return;
    const rows = classes.filter(c => selectedIds.includes(c.id));
    const doc = new jsPDF();
    doc.text("Class List", 14, 16);
    autoTable(doc, {
      head: [["Class", "Batch"]],
      body: rows.map(r => [r.name, batches.find((b: any) => b.id === r.batch_id)?.name || ""]),
      startY: 22,
    });
    doc.save("classes.pdf");
    toast({ title: "PDF Exported", description: "PDF file downloaded." });
  };

  // Open edit modal and prefill selected rows
  const openEditModal = () => {
    const selected = classes.filter(c => selectedIds.includes(c.id));
    setEditRows(selected.map(c => ({ id: c.id, name: c.name || c.class, batch_id: c.batch_id?.toString() || "" })));
    setIsEditModalOpen(true);
  };

  // Handle import file
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        // Expect header row: ["Class Name", "Batch Name"]
        const header = (json[0] as string[]).map(h => h.toLowerCase());
        const nameIdx = header.findIndex(h => h.includes("class"));
        const batchIdx = header.findIndex(h => h.includes("batch"));
        const rows = (json as any[][])
          .slice(1)
          .map(r => ({
            name: (r[nameIdx] || "").toString().trim(),
            batch_id: (() => {
              const batchName = (r[batchIdx] || "").toString().trim();
              const batch = batches.find((b: any) => b.name === batchName);
              return batch ? batch.id.toString() : "";
            })()
          }))
          .filter(r => r.name && r.batch_id);
        if (rows.length === 0) {
          setImportError("No valid class names and batch matches found in file.");
        } else {
          setImportedRows(rows);
        }
      } catch (err) {
        setImportError("Failed to parse file. Please upload a valid Excel or CSV file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Import submit
  const handleImportSubmit = async () => {
    if (importedRows.length === 0) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/classes/bulk`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ classes: importedRows })
      });
      if (res.ok) {
        toast({ title: "Import Success", description: `${importedRows.length} classes imported.` });
        setIsImportModalOpen(false);
        setImportedRows([]);
        handleReload();
      } else {
        const error = await res.json();
        setImportError(error.error || "Failed to import classes.");
      }
    } catch (err) {
      setImportError("Failed to import classes.");
    }
  };

  // Multi-edit submit
  const handleEditSubmit = async () => {
    if (editRows.some(r => !r.name.trim() || !r.batch_id)) {
      toast({ title: "Validation Error", description: "All class names and batch selections are required.", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/classes/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classes: editRows })
      });
      if (res.ok) {
        toast({ title: "Classes Updated", description: `${editRows.length} class(es) updated successfully.` });
        setIsEditModalOpen(false);
        setEditRows([]);
        handleReload();
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to update classes.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to update classes.", variant: "destructive" });
    }
  };

  // Multi-delete submit
  const handleDeleteSubmit = async () => {
    try {
      // Using the new POST endpoint for deletion instead of DELETE
      const idsToDelete = selectedIds.map(id => Number(id));
      console.log('Sending delete request with IDs:', idsToDelete);

      const res = await fetch(`${API_BASE_URL}/api/classes/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete })
      });

      console.log('Delete response status:', res.status);

      if (res.ok) {
        const result = await res.json();
        console.log('Delete response:', result);

        // Check for foreign key constraint errors first
        if (result.constraintErrors && result.constraintErrors.length > 0) {
          // There are constraint errors
          const constraintIds = result.constraintErrors.map(err => err.id).join(', ');
          toast({
            title: "Cannot Delete",
            description: `Class(es) #${constraintIds} ${result.constraintErrors.length > 1 ? 'are' : 'is'} in use by students or exams and cannot be deleted.`,
            variant: "destructive"
          });
        }
        // Then check for other success/failure conditions
        else if (result.deletedCount > 0) {
          toast({
            title: "Classes Deleted",
            description: `${result.deletedCount} of ${selectedIds.length} class(es) deleted successfully.`
          });
          setIsDeleteConfirmOpen(false);
          clearSelection();
          handleReload();
        } else {
          // None were deleted
          toast({
            title: "Delete Failed",
            description: `No classes were deleted. ${result.notFound?.length || 0} not found.`,
            variant: "destructive"
          });
        }
      } else {
        const error = await res.json();
        console.error('Delete error:', error);
        toast({
          title: "Error",
          description: error.error || "Failed to delete classes.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error('Delete exception:', err);
      toast({
        title: "Error",
        description: "Failed to delete classes. Check network connection.",
        variant: "destructive"
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Classes</h2>
            <p className="text-muted-foreground">
              Manage classes across different batches
            </p>
          </div>
          {/* Add Data Modal Step 1 */}
          <Dialog open={isAddStep1Open} onOpenChange={setIsAddStep1Open}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Data - Step 1</DialogTitle>
                <DialogDescription>Enter the number of classes to add (1-50).</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={addClassCount}
                  onChange={e => setAddClassCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                  placeholder="Number of classes"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setIsAddStep1Open(false)}>Cancel</Button>
                  <Button onClick={() => {
                    setAddClassRows(Array.from({ length: addClassCount }, (_, i) => ({ id: `new-${i + 1}`, name: "", batch_id: batches[0]?.id?.toString() || "" })));
                    setIsAddStep1Open(false);
                    setIsAddStep2Open(true);
                  }}>Generate</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {/* Add Data Modal Step 2 */}
          <Dialog open={isAddStep2Open} onOpenChange={setIsAddStep2Open}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Data - Step 2</DialogTitle>
                <DialogDescription>Enter names and select batch for the {addClassRows.length} new classes.</DialogDescription>
              </DialogHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Class Name</TableHead>
                      <TableHead>Batch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {addClassRows.map((row, idx) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.id}</TableCell>
                        <TableCell>
                          <Input
                            name={row.id}
                            value={row.name}
                            onChange={e => setAddClassRows(rows => rows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                            placeholder="Class name"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.batch_id}
                            onValueChange={v => setAddClassRows(rows => rows.map((r, i) => i === idx ? { ...r, batch_id: v } : r))}
                          >
                            <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                            <SelectContent>
                              {batches.map((b: any) => (
                                <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsAddStep2Open(false); setAddClassRows([]); }}>Cancel</Button>
                <Button onClick={async () => {
                  if (addClassRows.some(r => !r.name.trim() || !r.batch_id)) {
                    toast({ title: "Validation Error", description: "All class names and batch selections are required.", variant: "destructive" });
                    return;
                  }
                  // Send to backend
                  try {
                    const classData = addClassRows.map(r => ({ name: r.name, batch_id: r.batch_id }));
                    console.log('Creating new classes:', classData);
                    console.log('Add class rows state:', addClassRows);
                    
                    const res = await fetch(`${API_BASE_URL}/api/classes/bulk`, {
                      method: "POST",
                      headers: getAuthHeaders(),
                      body: JSON.stringify({ classes: classData })
                    });
                    if (res.ok) {
                      const created = await res.json();
                      setIsAddStep2Open(false);
                      setAddClassRows([]);
                      toast({ title: "Classes Added", description: `${created.length} classes added successfully.` });
                      handleReload();
                    } else {
                      const error = await res.json();
                      toast({ title: "Error", description: error.error || "Failed to add classes.", variant: "destructive" });
                    }
                  } catch (err) {
                    toast({ title: "Error", description: "Failed to add classes.", variant: "destructive" });
                  }
                }}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-4">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setIsAddStep1Open(true)}><FilePlus2 className="mr-1 h-4 w-4" /> Add Data</Button>
            <Button size="sm" onClick={() => setIsImportModalOpen(true)}><Download className="mr-1 h-4 w-4" /> Import</Button>
            <Button size="sm" variant="outline" onClick={handleReload}><RefreshCw className="mr-1 h-4 w-4" /> Reload</Button>
          </div>
            <div className="flex gap-2">
            <Button size="sm" onClick={openEditModal} disabled={selectedIds.length === 0}><Edit2 className="mr-1 h-4 w-4" /> Edit</Button>
            <Button size="sm" variant="destructive" onClick={() => setIsDeleteConfirmOpen(true)} disabled={selectedIds.length === 0}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy} disabled={selectedIds.length === 0}><Copy className="mr-1 h-4 w-4" /> Copy</Button>
            <Button size="sm" variant="outline" onClick={handlePrint} disabled={selectedIds.length === 0}><Printer className="mr-1 h-4 w-4" /> Print</Button>
            <Button size="sm" variant="outline" onClick={handleExcel} disabled={selectedIds.length === 0}><FileSpreadsheet className="mr-1 h-4 w-4" /> Excel</Button>
            <Button size="sm" variant="outline" onClick={handlePDF} disabled={selectedIds.length === 0}><FileText className="mr-1 h-4 w-4" /> PDF</Button>
          </div>
        </div>

        {/* Search + count */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2 gap-2">
          <div className="flex items-center w-full md:w-auto">
            <Input placeholder="Search classes..." className="w-full md:w-[250px]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground md:ml-4">{totalClasses} {totalClasses === 1 ? 'class found' : 'classes found'}</div>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Classes</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm">Show</span>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1 text-sm">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="text-sm">entries</span>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell">
                    <input type="checkbox" checked={isAllSelected} ref={el => { if (el) el.indeterminate = isIndeterminate; }} onChange={toggleSelectAll} />
                  </TableHead>

                  <TableHead>
                    Class
                    <Button variant="ghost" size="icon" className="ml-1 p-0 h-4 w-4 align-middle" onClick={() => {
                      setSortBy('name');
                      setSortOrder(order => order === 'asc' ? 'desc' : 'asc');
                    }}>
                      {sortOrder === 'asc' && sortBy === 'name' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    </Button>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">Batch</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClasses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">No classes found.</TableCell>
                  </TableRow>
                ) : (
                  paginatedClasses.map((cls) => (
                    <TableRow key={cls.id} className={selectedIds.includes(cls.id) ? "bg-muted" : ""}>
                      <TableCell className="hidden sm:table-cell">
                        <input type="checkbox" checked={selectedIds.includes(cls.id)} onChange={() => toggleSelectRow(cls.id)} />
                      </TableCell>
                      <TableCell>{cls.name || cls.class}</TableCell>
                      <TableCell className="hidden sm:table-cell">{batches.find((b: any) => b.id === cls.batch_id)?.name || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                                      <Button size="sm" variant="ghost" onClick={() => { setSelectedIds([cls.id]); openEditModal(); }}><Edit2 className="h-4 w-4" /></Button>
                                      <Button size="sm" variant="ghost" onClick={() => { setSelectedIds([cls.id]); setIsDeleteConfirmOpen(true); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                                    </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination controls inside table card */}
            <div className="flex items-center justify-between p-4 border-t flex-col sm:flex-row sm:items-center gap-2">
              <div className="text-sm text-muted-foreground w-full sm:w-auto">
                Showing {totalClasses === 0 ? 0 : ((page - 1) * pageSize + 1)} - {Math.min(page * pageSize, totalClasses)} of {totalClasses} entries
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="default" onClick={() => setPage(1)} disabled={page === 1}>First</Button>
                <Button size="sm" variant="default" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
                <div className="px-2 text-sm">Page {page} / {totalPages}</div>
                <Button size="sm" variant="default" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
                <Button size="sm" variant="default" onClick={() => setPage(totalPages)} disabled={page === totalPages}>Last</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Classes Modal (multi-edit) */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Classes</DialogTitle>
            <DialogDescription>Edit the name(s) and batch of the selected class(es).</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Class Name</TableHead>
                  <TableHead>Batch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editRows.map((row, idx) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.id}</TableCell>
                    <TableCell>
                      <Input
                        value={row.name}
                        onChange={e => setEditRows(rows => rows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                        placeholder="Class name"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.batch_id}
                        onValueChange={v => setEditRows(rows => rows.map((r, i) => i === idx ? { ...r, batch_id: v } : r))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                        <SelectContent>
                          {batches.map((b: any) => (
                            <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSubmit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog (multi-delete) */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Classes</DialogTitle>
            <DialogDescription>Are you sure you want to delete {selectedIds.length} selected class(es)? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSubmit}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Classes</DialogTitle>
            <DialogDescription>Upload an Excel or CSV file with columns for class name and batch name.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              ref={fileInputRef}
              onChange={handleImportFile}
              className="mb-2"
            />
            {importError && <div className="text-red-500 text-sm">{importError}</div>}
            {importedRows.length > 0 && (
              <div className="max-h-40 overflow-y-auto border rounded p-2 text-sm">
                <div className="font-semibold mb-1">Preview ({importedRows.length}):</div>
                <ul>
                  {importedRows.map((row, i) => (
                    <li key={i}>{row.name} ({batches.find((b: any) => b.id.toString() === row.batch_id)?.name || "Unknown Batch"})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsImportModalOpen(false); setImportedRows([]); setImportError(null); }}>Cancel</Button>
            <Button onClick={handleImportSubmit} disabled={importedRows.length === 0}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ClassesPage;
