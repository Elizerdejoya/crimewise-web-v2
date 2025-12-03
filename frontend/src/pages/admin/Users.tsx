import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Download,
  FilePlus2,
  RefreshCw,
  Edit2,
  Trash2,
  Copy,
  Printer,
  FileSpreadsheet,
  FileText,
  ArrowUp,
  ArrowDown,
  CheckSquare,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { urlToBase64 } from "@/lib/printUtils";
import printConfig from '@/lib/printConfig';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_BASE_URL } from "@/lib/config";

// Define user type
type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  organization_id?: number;
  password?: string; // Optional for editing
};

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

const AdminUsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortBy, setSortBy] = useState<
    "name" | "email" | "role" | "status" | null
  >(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("admin");
  const [newUser, setNewUser] = useState<Partial<User>>({
    name: "",
    email: "",
    role: "student",
    status: "active",
  });
  const [editUser, setEditUser] = useState<Partial<User>>({});
  const [statusToSet, setStatusToSet] = useState<"active" | "inactive">(
    "active"
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const currentUser = getCurrentUser();

  // Fetch users from backend
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/users`, {
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
          // Redirect to login or handle auth error
          return;
        }
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setUsers(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        toast({
          title: "Error",
          description: "Failed to fetch users.",
          variant: "destructive",
        });
        console.error("[Users][Fetch] Error:", err);
        setLoading(false);
      });
  };

  // Filter users by role for current tab
  const getUsersByRole = (role: string) => {
    return users.filter((user) => user.role === role);
  };

  // Get filtered users based on search term and current tab
  const getFilteredUsers = () => {
    let roleUsers;
    switch (activeTab) {
      case "admin":
        roleUsers = getUsersByRole("admin");
        break;
      case "instructor":
        roleUsers = getUsersByRole("instructor");
        break;
      case "student":
        roleUsers = getUsersByRole("student");
        break;
      default:
        roleUsers = users;
    }

    let filteredUsers = roleUsers.filter(
      (user) =>
        (user.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
        (user.email?.toLowerCase() || "").includes(searchTerm.toLowerCase())
    );

    if (sortBy) {
      filteredUsers = filteredUsers.sort((a, b) => {
        const aValue = a[sortBy] || "";
        const bValue = b[sortBy] || "";
        if (sortOrder === "asc")
          return String(aValue).localeCompare(String(bValue));
        else return String(bValue).localeCompare(String(aValue));
      });
    }

    return filteredUsers;
  };

  const filteredUsers = getFilteredUsers();

  const totalUsers = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const paginatedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  // Reset to first page when search or pageSize changes
  useEffect(() => { setPage(1); }, [searchTerm, pageSize]);

  // Check if current user can edit/delete a target user
  const canEditOrDelete = (targetUser: User) => {
    if (!currentUser) return false;

    // Super admin can edit/delete anyone
    if (currentUser.role === "super_admin") return true;

    // Admin restrictions
    if (currentUser.role === "admin") {
      // Cannot edit/delete super_admin
      if (targetUser.role === "super_admin") return false;

      // Cannot edit/delete users from other organizations
      if (targetUser.organization_id !== currentUser.organization_id)
        return false;

      // Cannot edit/delete other admins (except themselves)
      if (targetUser.role === "admin" && targetUser.id !== currentUser.id)
        return false;

      return true;
    }

    return false;
  };

  // Selection logic
  const isAllSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedIds.includes(u.id));
  const isIndeterminate = selectedIds.length > 0 && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedIds([]);
    else setSelectedIds(filteredUsers.map((u) => u.id));
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
    );
  };

  const clearSelection = () => setSelectedIds([]);

  // Check if any selected users can be edited/deleted
  const canEditSelected = () => {
    if (selectedIds.length !== 1) return false;
    const selectedUser = users.find((u) => u.id === selectedIds[0]);
    return selectedUser ? canEditOrDelete(selectedUser) : false;
  };

  const canDeleteSelected = () => {
    return (
      selectedIds.length > 0 &&
      selectedIds.every((id) => {
        const user = users.find((u) => u.id === id);
        return user ? canEditOrDelete(user) : false;
      })
    );
  };

  // Toolbar button handlers
  const handleReload = () => {
    fetchUsers();
    clearSelection();
  };

  const handleCopy = () => {
    if (selectedIds.length === 0) return;
    const rows = users.filter((u) => selectedIds.includes(u.id));
    const text = rows
      .map((r) => `${r.id}\t${r.name}\t${r.email}\t${r.role}\t${r.status}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Selected rows copied to clipboard.",
    });
  };

  const handlePrint = () => {
    if (selectedIds.length === 0) return;
    const rows = users.filter((u) => selectedIds.includes(u.id));
    const printWindow = window.open("", "", "height=600,width=800");
    if (printWindow) {
      printWindow.document.write(
        "<html><head><title>Print Users</title></head><body>"
      );
      printWindow.document.write(
        '<table border="1"><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr>'
      );
      rows.forEach((r) =>
        printWindow.document.write(
          `<tr><td>${r.id}</td><td>${r.name || "-"}</td><td>${r.email || "-"
          }</td><td>${r.role || "-"}</td><td>${r.status || "-"}</td></tr>`
        )
      );
      printWindow.document.write("</table></body></html>");
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleExcel = () => {
    if (selectedIds.length === 0) return;
    const rows = users.filter((u) => selectedIds.includes(u.id));
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        ID: r.id,
        Name: r.name || "-",
        Email: r.email || "-",
        Role: r.role || "-",
        Status: r.status || "-",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, "users.xlsx");
    toast({ title: "Excel Exported", description: "Excel file downloaded." });
  };

  const handlePDF = () => {
    if (selectedIds.length === 0) return;
    const rows = users.filter((u) => selectedIds.includes(u.id));
    const doc = new jsPDF();
    doc.text("User List", 14, 16);
    autoTable(doc, {
      head: [["ID", "Name", "Email", "Role", "Status"]],
      body: rows.map((r) => [
        r.id,
        r.name || "-",
        r.email || "-",
        r.role || "-",
        r.status || "-",
      ]),
      startY: 22,
    });
    doc.save("users.pdf");
    toast({ title: "PDF Exported", description: "PDF file downloaded." });
  };

  // Open edit modal and prefill selected user
  const openEditModal = () => {
    if (selectedIds.length !== 1) {
      toast({
        title: "Info",
        description: "Please select exactly one user to edit.",
      });
      return;
    }

    const selected = users.find((u) => u.id === selectedIds[0]);
    if (selected && canEditOrDelete(selected)) {
      setEditUser({ ...selected });
      setIsEditModalOpen(true);
    } else {
      toast({
        title: "Permission Denied",
        description: "You cannot edit this user.",
        variant: "destructive",
      });
    }
  };

  // Handle status change for multiple users
  const handleBulkStatusChange = async () => {
    if (selectedIds.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/bulk/status`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ids: selectedIds,
          status: statusToSet,
        }),
      });

      if (res.ok) {
        setUsers((users) =>
          users.map((u) =>
            selectedIds.includes(u.id) ? { ...u, status: statusToSet } : u
          )
        );
        toast({
          title: "Status Updated",
          description: `Status updated for ${selectedIds.length} users.`,
        });
        setIsBulkStatusOpen(false);
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to update users.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update users.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle delete for multiple users
  const handleDeleteUsers = async () => {
    if (selectedIds.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/bulk-delete`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (res.ok) {
        const result = await res.json();
        console.log("Delete operation result:", result);

        // Check if we have detailed results from the backend
        if (result.deletedCount !== undefined) {
          setUsers((users) => users.filter((u) => !selectedIds.includes(u.id)));

          // Provide more detailed feedback to user
          if (result.constraintErrors && result.constraintErrors.length > 0) {
            toast({
              title: "Partial Delete",
              description: `${result.deletedCount} user(s) deleted. ${result.constraintErrors.length} could not be deleted due to permissions or dependencies.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Users Deleted",
              description: `${result.deletedCount} user(s) deleted successfully.`,
            });
          }
        } else {
          // Fallback for simple success message
          setUsers((users) => users.filter((u) => !selectedIds.includes(u.id)));
          toast({
            title: "Users Deleted",
            description: `${selectedIds.length} user(s) deleted successfully.`,
          });
        }

        setIsDeleteConfirmOpen(false);
        clearSelection();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to delete users.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("[Users][Delete] Error:", err);
      toast({
        title: "Error",
        description: "Failed to delete users.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle add new user
  const handleAddUser = async () => {
    // Validate inputs
    if (!newUser.name || !newUser.email || !newUser.role) {
      toast({
        title: "Validation Error",
        description: "All fields are required.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(newUser),
      });

      if (res.ok) {
        const createdUser = await res.json();
        toast({
          title: "User Added",
          description: "User created successfully.",
        });
        setIsAddModalOpen(false);
        // Reset form
        setNewUser({
          name: "",
          email: "",
          role: "student",
          status: "active",
        });
        // Refetch users with proper organization filtering
        fetchUsers();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to add user.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to add user.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle edit user
  const handleEditUser = async () => {
    // Validate inputs
    if (!editUser.name || !editUser.email || !editUser.role) {
      toast({
        title: "Validation Error",
        description: "All fields are required.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Create request body, conditionally including password if provided
      const requestBody = {
        name: editUser.name,
        email: editUser.email,
        role: editUser.role,
        status: editUser.status,
        password: editUser.password,
      };

      // Only include password if it's not empty
      if (editUser.password && editUser.password.trim() !== "") {
        requestBody.password = editUser.password;
      }

      const res = await fetch(`${API_BASE_URL}/api/users/${editUser.id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        setUsers((users) =>
          users.map((u) => (u.id === editUser.id ? { ...u, ...editUser } : u))
        );
        toast({
          title: "User Updated",
          description: "User updated successfully.",
        });
        setIsEditModalOpen(false);
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to update user.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update user.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get role-specific restrictions for the add user form
  const getAvailableRoles = () => {
    if (!currentUser) return [];

    if (currentUser.role === "super_admin") {
      return [
        { value: "super_admin", label: "Super Admin" },
        { value: "admin", label: "Admin" },
        { value: "instructor", label: "Instructor" },
        { value: "student", label: "Student" },
      ];
    } else if (currentUser.role === "admin") {
      return [
        { value: "admin", label: "Admin" },
        { value: "instructor", label: "Instructor" },
        { value: "student", label: "Student" },
      ];
    }

    return [];
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">
            View and manage users by role.
          </p>
        </div>

        {/* Role Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="admin">
              Admins ({getUsersByRole("admin").length})
            </TabsTrigger>
            <TabsTrigger value="instructor">
              Instructors ({getUsersByRole("instructor").length})
            </TabsTrigger>
            <TabsTrigger value="student">
              Students ({getUsersByRole("student").length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-4">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
                  <FilePlus2 className="mr-1 h-4 w-4" /> Add User
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsBulkStatusOpen(true)}
                  disabled={selectedIds.length === 0}
                >
                  <CheckSquare className="mr-1 h-4 w-4" /> Set Status
                </Button>
                <Button size="sm" variant="outline" onClick={handleReload}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Reload
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={openEditModal}
                  disabled={!canEditSelected()}
                >
                  <Edit2 className="mr-1 h-4 w-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  disabled={!canDeleteSelected()}
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
                  onClick={handlePrint}
                  disabled={selectedIds.length === 0}
                >
                  <Printer className="mr-1 h-4 w-4" /> Print
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

            {/* Search */}
            <div className="flex items-center mb-2">
              <Input
                ref={searchInputRef}
                placeholder="Search users..."
                className="w-[250px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Data Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  {activeTab === "admin" && "Admin Users"}
                  {activeTab === "instructor" && "Instructor Users"}
                  {activeTab === "student" && "Student Users"}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-muted-foreground">Show</div>
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1 text-sm">
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <div className="text-sm text-muted-foreground">entries</div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isIndeterminate;
                          }}
                          onChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>
                        Name
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-1 p-0 h-4 w-4 align-middle"
                          onClick={() => {
                            setSortBy("name");
                            setSortOrder((order) =>
                              order === "asc" ? "desc" : "asc"
                            );
                          }}
                        >
                          {sortBy === "name" ? (
                            sortOrder === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowDown className="h-3 w-3 opacity-30" />
                          )}
                        </Button>
                      </TableHead>
                      <TableHead>
                        Email
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-1 p-0 h-4 w-4 align-middle"
                          onClick={() => {
                            setSortBy("email");
                            setSortOrder((order) =>
                              order === "asc" ? "desc" : "asc"
                            );
                          }}
                        >
                          {sortBy === "email" ? (
                            sortOrder === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowDown className="h-3 w-3 opacity-30" />
                          )}
                        </Button>
                      </TableHead>
                      <TableHead>
                        Status
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-1 p-0 h-4 w-4 align-middle"
                          onClick={() => {
                            setSortBy("status");
                            setSortOrder((order) =>
                              order === "asc" ? "desc" : "asc"
                            );
                          }}
                        >
                          {sortBy === "status" ? (
                            sortOrder === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowDown className="h-3 w-3 opacity-30" />
                          )}
                        </Button>
                      </TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">
                          No users found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedUsers.map((user) => (
                        <TableRow
                          key={user.id}
                          className={
                            selectedIds.includes(user.id) ? "bg-muted" : ""
                          }
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(user.id)}
                              onChange={() => toggleSelectRow(user.id)}
                            />
                          </TableCell>
                          <TableCell>{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <div
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.status === "active"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                                }`}
                            >
                              {user.status}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {canEditOrDelete(user) ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedIds([user.id]);
                                      openEditModal();
                                    }}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => {
                                      setSelectedIds([user.id]);
                                      setIsDeleteConfirmOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  No access
                                </span>
                              )}
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
                Showing {totalUsers === 0 ? 0 : ((page - 1) * pageSize + 1)} - {Math.min(page * pageSize, totalUsers)} of {totalUsers} entries
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
          </TabsContent>
        </Tabs>

        {/* Add User Modal */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>
                Enter the details for the new user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password (default: password123)"
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value) =>
                    setNewUser({ ...newUser, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableRoles().map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="status">Active</Label>
                <Switch
                  id="status"
                  checked={newUser.status === "active"}
                  onCheckedChange={(checked) =>
                    setNewUser({
                      ...newUser,
                      status: checked ? "active" : "inactive",
                    })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddUser} disabled={loading}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>Update the user's details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={editUser.name || ""}
                  onChange={(e) =>
                    setEditUser({ ...editUser, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email Address</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editUser.email || ""}
                  onChange={(e) =>
                    setEditUser({ ...editUser, email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Password</Label>
                <Input
                  id="edit-password"
                  type="password"
                  placeholder="Leave blank to keep current password"
                  onChange={(e) =>
                    setEditUser({ ...editUser, password: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={editUser.role || ""}
                  onValueChange={(value) =>
                    setEditUser({ ...editUser, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableRoles().map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="edit-status">Active</Label>
                <Switch
                  id="edit-status"
                  checked={editUser.status === "active"}
                  onCheckedChange={(checked) =>
                    setEditUser({
                      ...editUser,
                      status: checked ? "active" : "inactive",
                    })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleEditUser} disabled={loading}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={isDeleteConfirmOpen}
          onOpenChange={setIsDeleteConfirmOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedIds.length} selected
                user(s)? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteUsers}
                disabled={loading}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Status Update Dialog */}
        <Dialog open={isBulkStatusOpen} onOpenChange={setIsBulkStatusOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Status</DialogTitle>
              <DialogDescription>
                Set status for {selectedIds.length} selected user(s).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={statusToSet}
                  onValueChange={(value) =>
                    setStatusToSet(value as "active" | "inactive")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsBulkStatusOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleBulkStatusChange} disabled={loading}>
                Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default AdminUsersPage;
