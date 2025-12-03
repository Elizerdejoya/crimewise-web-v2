import { useState, useEffect, useRef } from "react";

import { useToast } from "@/hooks/use-toast";
import { FilePlus2, RefreshCw, Edit2, Trash2, Copy, Printer, FileSpreadsheet, FileText, Download, ArrowUp, ArrowDown, ChevronUp, ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { API_BASE_URL } from "@/lib/config";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";

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

const InstructorsPage = () => {
  const [instructors, setInstructors] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddStep1Open, setIsAddStep1Open] = useState(false);
  const [isAddStep2Open, setIsAddStep2Open] = useState(false);
  const [addInstructorCount, setAddInstructorCount] = useState(1);
  const [addInstructorRows, setAddInstructorRows] = useState<{ id: string; name: string; email: string; instructorId: string; password: string }[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editRows, setEditRows] = useState<{ id: number; name: string; email: string; instructorId: string; password: string }[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedRows, setImportedRows] = useState<{ name: string; email: string; instructorId: string; password: string }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>("asc");
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'instructorId' | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const currentUser = getCurrentUser();

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Fetch instructors from backend
  useEffect(() => {
    fetchInstructors();
  }, []);

  const fetchInstructors = () => {
    fetch(`${API_BASE_URL}/api/instructors`, {
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
          setInstructors(data);
        }
      })
      .catch((err) => {
        toast({ title: "Error", description: "Failed to fetch instructors.", variant: "destructive" });
        console.error("[Instructors][Fetch] Error:", err);
      });
  };

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column as 'name' | 'email' | 'instructorId');
      setSortOrder("asc");
    }
  };

  // Filter and sort instructors based on search term and sort order
  const filteredAndSortedInstructors = instructors.filter((instructor) =>
    instructor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instructor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    instructor.instructor_id?.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    if (!sortBy) return 0;

    let aVal, bVal;

    switch (sortBy) {
      case "name":
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
        break;
      case "email":
        aVal = (a.email || "").toLowerCase();
        bVal = (b.email || "").toLowerCase();
        break;
      case "instructorId":
        aVal = (a.instructor_id || "").toLowerCase();
        bVal = (b.instructor_id || "").toLowerCase();
        break;
      
      default:
        return 0;
    }

    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Keep for backward compatibility
  const filteredInstructors = filteredAndSortedInstructors;

  // Pagination
  const totalInstructors = filteredInstructors.length;
  const totalPages = Math.max(1, Math.ceil(totalInstructors / pageSize));
  if (page > totalPages) setPage(totalPages);
  const paginatedInstructors = filteredInstructors.slice((page - 1) * pageSize, page * pageSize);
  // Reset to first page on search or pageSize change
  useEffect(() => { setPage(1); }, [searchTerm, pageSize]);

  // Selection logic
  const isAllSelected = filteredInstructors.length > 0 && filteredInstructors.every(i => selectedIds.includes(i.id));
  const isIndeterminate = selectedIds.length > 0 && !isAllSelected;
  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filteredInstructors.map(i => i.id));
  };
  const toggleSelectRow = (id: number) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  };
  const clearSelection = () => setSelectedIds([]);

  // Sortable header component
  const SortableHeader = ({ column, children, className }: { column: string; children: React.ReactNode; className?: string }) => {
    const isSorted = sortBy === column;
    const isAsc = isSorted && sortOrder === "asc";
    const isDesc = isSorted && sortOrder === "desc";

    const classes = `cursor-pointer select-none hover:bg-muted/50 transition-colors ${className || ''}`;

    return (
      <TableHead
        className={classes}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center justify-between">
          <span>{children}</span>
          <div className="flex flex-col ml-1">
            <ChevronUp
              className={`h-3 w-3 ${isAsc ? 'text-primary' : 'text-muted-foreground/50'}`}
            />
            <ChevronDown
              className={`h-3 w-3 -mt-1 ${isDesc ? 'text-primary' : 'text-muted-foreground/50'}`}
            />
          </div>
        </div>
      </TableHead>
    );
  };

  // Generate instructor rows for the add modal
  const generateInstructorRows = (count: number) => {
    setAddInstructorRows(Array.from({ length: count }, (_, i) => ({
      id: `new-${i + 1}`,
      name: "",
      email: "",
      instructorId: `INST-${Math.floor(Math.random() * 10000)}`,
      password: "CRIMEWISE"
    })));
  };

  // Toolbar button handlers
  const handleReload = () => {
    fetchInstructors();
    clearSelection();
  };

  const handleCopy = () => {
    if (selectedIds.length === 0) return;
    const rows = instructors.filter(i => selectedIds.includes(i.id));
    const text = rows.map(r => `${r.name}\t${r.email}\t${r.instructor_id || "-"}`).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Selected rows copied to clipboard." });
  };
  const handlePrint = () => {
    if (selectedIds.length === 0) return;
    const rows = instructors.filter(i => selectedIds.includes(i.id));
    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Instructors</title></head><body>');
      printWindow.document.write('<table border="1"><tr><th>Name</th><th>Email</th><th>Instructor ID</th></tr>');
      rows.forEach(r => printWindow.document.write(`<tr><td>${r.name}</td><td>${r.email}</td><td>${r.instructor_id || "-"}</td></tr>`));
      printWindow.document.write('</table></body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };
  const handleExcel = () => {
    if (selectedIds.length === 0) return;
    const rows = instructors.filter(i => selectedIds.includes(i.id));
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ 
      Name: r.name, 
      Email: r.email, 
      "Instructor ID": r.instructor_id || "-" 
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Instructors");
    XLSX.writeFile(wb, "instructors.xlsx");
    toast({ title: "Excel Exported", description: "Excel file downloaded." });
  };
  const handlePDF = () => {
    if (selectedIds.length === 0) return;
    const rows = instructors.filter(i => selectedIds.includes(i.id));
    const doc = new jsPDF();
    doc.text("Instructor List", 14, 16);
    autoTable(doc, {
      head: [["Name", "Email", "Instructor ID"]],
      body: rows.map(r => [r.name, r.email, r.instructor_id || "-"] ),
      startY: 22,
    });
    doc.save("instructors.pdf");
    toast({ title: "PDF Exported", description: "PDF file downloaded." });
  };

  // Open edit modal and prefill selected rows
  const openEditModal = () => {
    const selected = instructors.filter(i => selectedIds.includes(i.id));
    setEditRows(selected.map(i => ({
      id: i.id,
      name: i.name,
      email: i.email,
      instructorId: i.instructor_id || '', // Map from backend property name to frontend
      password: '' // Initialize with empty string
    })));
    setIsEditModalOpen(true);
  };

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
        
        // Debug: Log what we're parsing
        console.log("Raw Excel data:", json);
        
        // Match the exact export format: ID | Name | Email | Instructor ID
        let idColumnIndex = 0; // Default to first column (ID)
        let nameColumnIndex = 1; // Default to second column (Name)
        let emailColumnIndex = 2; // Default to third column (Email)
        let instructorIdColumnIndex = 3; // Default to fourth column (Instructor ID)
        
        // If we have a header row, try to find the columns
        if (json.length > 0) {
          const header = (json[0] as string[]).map(h => h.toString().toLowerCase());
          console.log("Excel headers found:", header);
          
          // Look for exact matches first (export format)
          const idIdx = header.findIndex(h => h === "id");
          const nameIdx = header.findIndex(h => h === "name");
          const emailIdx = header.findIndex(h => h === "email");
          const instructorIdIdx = header.findIndex(h => h === "instructor id");
          
          // If exact matches found, use them
          if (idIdx !== -1) {
            idColumnIndex = idIdx;
            console.log("✅ Found ID column at index:", idIdx, "Header:", header[idIdx]);
          }
          
          if (nameIdx !== -1) {
            nameColumnIndex = nameIdx;
            console.log("✅ Found Name column at index:", nameIdx, "Header:", header[nameIdx]);
          } else {
            // Fallback: look for name-like headers
            const fallbackNameIdx = header.findIndex(h => 
              h.includes("name") || h.includes("instructor") || h.includes("title") || h.includes("full")
            );
            if (fallbackNameIdx !== -1) {
              nameColumnIndex = fallbackNameIdx;
              console.log("✅ Found name column (fallback) at index:", fallbackNameIdx, "Header:", header[fallbackNameIdx]);
            } else {
              console.log("⚠️ No name column found in header, using second column. Header:", header);
            }
          }
          
          if (emailIdx !== -1) {
            emailColumnIndex = emailIdx;
            console.log("✅ Found Email column at index:", emailIdx, "Header:", header[emailIdx]);
          } else {
            // Fallback: look for email-like headers
            const fallbackEmailIdx = header.findIndex(h => 
              h.includes("email") || h.includes("mail") || h.includes("e-mail")
            );
            if (fallbackEmailIdx !== -1) {
              emailColumnIndex = fallbackEmailIdx;
              console.log("✅ Found email column (fallback) at index:", fallbackEmailIdx, "Header:", header[fallbackEmailIdx]);
            } else {
              console.log("⚠️ No email column found in header, using third column. Header:", header);
            }
          }
          
          if (instructorIdIdx !== -1) {
            instructorIdColumnIndex = instructorIdIdx;
            console.log("✅ Found Instructor ID column at index:", instructorIdIdx, "Header:", header[instructorIdIdx]);
          } else {
            // Fallback: look for instructor ID-like headers
            const fallbackInstructorIdIdx = header.findIndex(h => 
              (h.includes("instructor") && h.includes("id")) || h.includes("instructorid")
            );
            if (fallbackInstructorIdIdx !== -1) {
              instructorIdColumnIndex = fallbackInstructorIdIdx;
              console.log("✅ Found instructor ID column (fallback) at index:", fallbackInstructorIdIdx, "Header:", header[fallbackInstructorIdIdx]);
            } else {
              console.log("⚠️ No instructor ID column found in header, using fourth column. Header:", header);
            }
          }
        }
        
        const rows = (json as any[][])
          .slice(1) // Skip header row
          .map((r, index) => {
            const name = (r[nameColumnIndex] || "").toString().trim();
            const email = (r[emailColumnIndex] || "").toString().trim();
            const instructorIdFromFile = (r[instructorIdColumnIndex] || "").toString().trim();
            
            // Debug: Log what we're reading from each column
            console.log(`Row ${index + 1}:`, {
              name: name,
              email: email,
              instructorIdFromFile: instructorIdFromFile,
              nameColumnIndex: nameColumnIndex,
              emailColumnIndex: emailColumnIndex,
              instructorIdColumnIndex: instructorIdColumnIndex,
              rawRow: r
            });
            
            // Use instructor ID from file, or generate one if empty
            const instructorId = instructorIdFromFile || `INST-${Math.floor(10000 + Math.random() * 90000)}`;
            
            // Generate default password
            const password = `password${Math.floor(Math.random() * 10000)}`;
            
            return {
              name,
              email,
              instructorId,
              password
            };
          })
          .filter(r => r.name && r.email);
        
        console.log("Parsed instructor rows:", rows);
        console.log("Sample row data:", rows[0]); // Show first row for debugging
        
        if (rows.length === 0) {
          setImportError("No valid instructor data found in file.");
        } else {
          setImportedRows(rows);
        }
      } catch (err) {
        setImportError("Failed to parse file. Please upload a valid Excel or CSV file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportSubmit = async () => {
    if (importedRows.length === 0) return;
    try {
      // Debug: Log what we're sending to backend
      console.log("Sending to backend:", { instructors: importedRows });
      
      const res = await fetch(`${API_BASE_URL}/api/instructors/bulk`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ instructors: importedRows })
      });
      if (res.ok) {
        toast({ title: "Import Success", description: `${importedRows.length} instructors imported.` });
        setIsImportModalOpen(false);
        setImportedRows([]);
        handleReload();
      } else {
        const error = await res.json();
        setImportError(error.error || "Failed to import instructors.");
      }
    } catch (err) {
      setImportError("Failed to import instructors.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
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
            <Input ref={searchInputRef} placeholder="Search instructors by name, email, or ID..." className="w-full md:w-[300px]" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground md:ml-4">{totalInstructors} {totalInstructors === 1 ? 'instructor found' : 'instructors found'}</div>
        </div>
        {/* Data Table */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Instructors</CardTitle>
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
                  <SortableHeader column="instructorId" className="hidden sm:table-cell">Instructor ID</SortableHeader>
                  <SortableHeader column="name">Name</SortableHeader>
                  <SortableHeader column="email" className="hidden sm:table-cell">Email</SortableHeader>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInstructors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">No instructors found.</TableCell>
                  </TableRow>
                ) : (
                  paginatedInstructors.map((instructor) => (
                    <TableRow key={instructor.id} className={selectedIds.includes(instructor.id) ? "bg-muted" : ""}>
                      <TableCell className="hidden sm:table-cell">
                        <input type="checkbox" checked={selectedIds.includes(instructor.id)} onChange={() => toggleSelectRow(instructor.id)} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{instructor.instructor_id}</TableCell>
                      <TableCell>{instructor.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{instructor.email}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedIds([instructor.id]); openEditModal(); }}><Edit2 className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedIds([instructor.id]); setIsDeleteConfirmOpen(true); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
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
                Showing {totalInstructors === 0 ? 0 : ((page - 1) * pageSize + 1)} - {Math.min(page * pageSize, totalInstructors)} of {totalInstructors} entries
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
        {/* Modals */}
        {/* Add Data Modal Step 1 */}
        <Dialog open={isAddStep1Open} onOpenChange={setIsAddStep1Open}>
          <DialogContent className="max-w-[800px] w-full">
            <DialogHeader>
              <DialogTitle>Add Data - Step 1</DialogTitle>
              <DialogDescription>
                Enter the number of instructors to add (1-50).
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <Input
                type="number"
                min={1}
                max={50}
                value={addInstructorCount}
                onChange={(e) =>
                  setAddInstructorCount(
                    Math.max(1, Math.min(50, Number(e.target.value)))
                  )
                }
                placeholder="Number of instructors"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsAddStep1Open(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setAddInstructorRows(
                      Array.from({ length: addInstructorCount }, (_, i) => ({
                        id: `new-${i + 1}`,
                        name: "",
                        email: "",
                        password: "CRIMEWISE",
                        instructorId: `INST-${Math.floor(10000 + Math.random() * 90000)}`,
                      }))
                    );
                    setIsAddStep1Open(false);
                    setIsAddStep2Open(true);
                  }}
                >
                  Generate
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Data Modal Step 2 */}
        <Dialog open={isAddStep2Open} onOpenChange={setIsAddStep2Open}>
          <DialogContent className="max-w-[90vw] w-full">
            <DialogHeader>
              <DialogTitle>Add Data - Step 2</DialogTitle>
              <DialogDescription>
                Enter details for the {addInstructorRows.length} new instructors.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No.</TableHead>
                    <TableHead>Name *</TableHead>
                    <TableHead>Email *</TableHead>
                    <TableHead>Instructor ID *</TableHead>
                    <TableHead>Password *</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {addInstructorRows.map((row, idx) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <Input
                          value={row.name}
                          onChange={e => setAddInstructorRows(rows =>
                            rows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r)
                          )}
                          placeholder="Enter instructor name"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="email"
                          value={row.email}
                          onChange={e => setAddInstructorRows(rows =>
                            rows.map((r, i) => i === idx ? { ...r, email: e.target.value } : r)
                          )}
                          placeholder="Enter email address"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.instructorId}
                          onChange={e => setAddInstructorRows(rows =>
                            rows.map((r, i) => i === idx ? { ...r, instructorId: e.target.value } : r)
                          )}
                          placeholder="Enter instructor ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          value={row.password}
                          onChange={e => setAddInstructorRows(rows =>
                            rows.map((r, i) => i === idx ? { ...r, password: e.target.value } : r)
                          )}
                          placeholder="Enter password"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddStep2Open(false);
                  setAddInstructorRows([]);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  console.log("[Add Instructors] Starting validation...");
                  console.log("[Add Instructors] Rows to validate:", addInstructorRows);

                  if (
                    addInstructorRows.some(
                      (r) =>
                        !r.name.trim() ||
                        !r.email.trim() ||
                        !r.instructorId.trim() ||
                        !r.password.trim()
                    )
                  ) {
                    console.log("[Add Instructors] Validation failed: Missing required fields");
                    toast({
                      title: "Validation Error",
                      description:
                        "All instructor names, emails, instructor IDs, and passwords are required.",
                      variant: "destructive",
                    });
                    return;
                  }

                  console.log("[Add Instructors] Validation passed, sending to backend...");

                  // Send to backend
                  try {
                    const payload = {
                      instructors: addInstructorRows.map((r) => ({
                        name: r.name,
                        email: r.email,
                        password: r.password,
                        instructorId: r.instructorId,
                        role: "instructor",
                        status: "active",
                      })),
                    };

                    console.log("[Add Instructors] Payload:", payload);

                    const res = await fetch(
                      `${API_BASE_URL}/api/instructors/bulk`,
                      {
                        method: "POST",
                        headers: getAuthHeaders(),
                        body: JSON.stringify(payload),
                      }
                    );

                    console.log("[Add Instructors] Response status:", res.status);

                    if (res.ok) {
                      const result = await res.json();
                      console.log("[Add Instructors] Success response:", result);
                      setIsAddStep2Open(false);
                      setAddInstructorRows([]);
                      toast({
                        title: "Instructors Added",
                        description: `${addInstructorRows.length} instructors added successfully.`,
                      });
                      handleReload();
                    } else {
                      const error = await res.json();
                      console.log("[Add Instructors] Error response:", error);
                      toast({
                        title: "Error",
                        description: error.error || "Failed to add instructors.",
                        variant: "destructive",
                      });
                    }
                  } catch (err) {
                    console.error("[Add Instructors] Network error:", err);
                    toast({
                      title: "Error",
                      description: "Failed to add instructors.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Edit Instructor Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-[90vw] w-full">
            <DialogHeader>
              <DialogTitle>Edit Instructor</DialogTitle>
              <DialogDescription>Edit the details of the selected instructor(s).</DialogDescription>
            </DialogHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Instructor ID</TableHead>
                    <TableHead>Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instructors.filter(i => selectedIds.includes(i.id)).map((row, idx) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.id}</TableCell>
                      <TableCell>
                        <Input
                          value={editRows[idx]?.name ?? row.name}
                          onChange={e => setEditRows(rows => {
                            const newRows = [...rows];
                            newRows[idx] = {
                              ...newRows[idx] || {
                                id: row.id,
                                name: row.name,
                                email: row.email,
                                instructorId: row.instructor_id || '',
                                password: ''
                              },
                              name: e.target.value
                            };
                            return newRows;
                          })}
                          placeholder="Instructor name"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editRows[idx]?.email ?? row.email}
                          onChange={e => setEditRows(rows => {
                            const newRows = [...rows];
                            newRows[idx] = {
                              ...newRows[idx] || {
                                id: row.id,
                                name: row.name,
                                email: row.email,
                                instructorId: row.instructor_id || '',
                                password: ''
                              },
                              email: e.target.value
                            };
                            return newRows;
                          })}
                          placeholder="Instructor email"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={editRows[idx]?.instructorId ?? (row.instructor_id || '')}
                          onChange={e => setEditRows(rows => {
                            const newRows = [...rows];
                            newRows[idx] = {
                              ...newRows[idx] || {
                                id: row.id,
                                name: row.name,
                                email: row.email,
                                instructorId: row.instructor_id || '',
                                password: ''
                              },
                              instructorId: e.target.value
                            };
                            return newRows;
                          })}
                          placeholder="Instructor ID"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="password"
                          value={editRows[idx]?.password ?? ''}
                          onChange={e => setEditRows(rows => {
                            const newRows = [...rows];
                            newRows[idx] = {
                              ...newRows[idx] || {
                                id: row.id,
                                name: row.name,
                                email: row.email,
                                instructorId: row.instructor_id || '',
                                password: ''
                              },
                              password: e.target.value
                            };
                            return newRows;
                          })}
                          placeholder="Password"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                // Validate
                if (editRows.some(r => !r.name?.trim() || !r.email?.trim() || !r.instructorId?.trim())) {
                  toast({ title: "Validation Error", description: "Instructor name, email, and ID are required.", variant: "destructive" });
                  return;
                }
                // Send to backend (bulk update)
                try {
                  const res = await fetch(`${API_BASE_URL}/api/instructors/bulk`, {
                    method: "PATCH", // Changed from PUT to PATCH to match backend
                    headers: getAuthHeaders(), // Added missing auth headers
                    body: JSON.stringify({
                      instructors: editRows.map(r => ({
                        id: r.id,
                        name: r.name,
                        email: r.email,
                        instructorId: r.instructorId,
                        password: r.password // Only include if provided
                      }))
                    })
                  });
                  if (res.ok) {
                    const result = await res.json();
                    toast({
                      title: "Instructors Updated",
                      description: `${result.results?.updated?.length || 0} instructor(s) updated successfully.`
                    });
                    setIsEditModalOpen(false);
                    setEditRows([]);
                    handleReload();
                  } else {
                    const error = await res.json();
                    toast({ title: "Error", description: error.error || "Failed to update instructors.", variant: "destructive" });
                  }
                } catch (err) {
                  toast({ title: "Error", description: "Failed to update instructors.", variant: "destructive" });
                }
              }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Instructor</DialogTitle>
              <DialogDescription>Are you sure you want to delete {selectedIds.length} selected instructor(s)? This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={async () => {
                try {
                  // Using the new POST endpoint for deletion instead of DELETE
                  const idsToDelete = selectedIds.map(id => Number(id));
                  console.log('Sending delete request with IDs:', idsToDelete);

                  const res = await fetch(`${API_BASE_URL}/api/instructors/bulk-delete`, {
                    method: "POST",
                    headers: getAuthHeaders(), // Added missing auth headers
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
                        description: `Instructor(s) #${constraintIds} ${result.constraintErrors.length > 1 ? 'are' : 'is'} assigned to classes or exams and cannot be deleted.`,
                        variant: "destructive"
                      });
                    }
                    // Then check for other success/failure conditions
                    else if (result.deletedCount > 0) {
                      toast({
                        title: "Instructors Deleted",
                        description: `${result.deletedCount} of ${selectedIds.length} instructor(s) deleted successfully.`
                      });
                      setIsDeleteConfirmOpen(false);
                      clearSelection();
                      handleReload();
                    } else {
                      // None were deleted
                      toast({
                        title: "Delete Failed",
                        description: `No instructors were deleted. ${result.notFound?.length || 0} not found.`,
                        variant: "destructive"
                      });
                    }
                  } else {
                    const error = await res.json();
                    console.error('Delete error:', error);
                    toast({
                      title: "Error",
                      description: error.error || "Failed to delete instructors.",
                      variant: "destructive"
                    });
                  }
                } catch (err) {
                  console.error('Delete exception:', err);
                  toast({
                    title: "Error",
                    description: "Failed to delete instructors. Check network connection.",
                    variant: "destructive"
                  });
                }
              }}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Import Modal */}
        <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
          <DialogContent className="max-w-[800px] w-full">
            <DialogHeader>
              <DialogTitle>Import Instructors</DialogTitle>
              <DialogDescription>Upload an Excel or CSV file with columns: ID, Name, Email, Instructor ID (matches export format).</DialogDescription>
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
                      <li key={i}>{row.name} - {row.email} - ID: {row.instructorId}</li>
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
      </div>
    </DashboardLayout>
  );
}

export default InstructorsPage;
