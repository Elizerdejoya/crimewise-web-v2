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
  Building2,
  Users,
  Calendar,
  DollarSign,
  Eye,
  EyeOff,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/lib/config";
import { notifySubscriptionUpdate } from "@/lib/subscriptionUtils";

// Define organization type
type Organization = {
  id: number;
  name: string;
  domain: string;
  admin_name: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  current_plan?: string;
  subscription_status?: string;
  subscription_end_date?: string;
  max_users?: number;
  max_storage_gb?: number;
  user_count?: number;
  admin_email?: string;
  admin_password?: string;
};

const AdminOrganizationsPage = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortBy, setSortBy] = useState<
    "name" | "domain" | "status" | "current_plan" | null
  >(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [newOrganization, setNewOrganization] = useState<Partial<Organization>>(
    {
      name: "",
      domain: "",
      admin_name: "",
      admin_email: "",
      admin_password: "",
      status: "active",
    }
  );
  const [editOrganization, setEditOrganization] = useState<
    Partial<Organization>
  >({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch organizations from backend
  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/organizations`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setOrganizations(data);
        setLoading(false);
      })
      .catch((err) => {
        toast({
          title: "Error",
          description: "Failed to fetch organizations.",
          variant: "destructive",
        });
        console.error("[Organizations][Fetch] Error:", err);
        setLoading(false);
      });
  };

  // Filter and sort organizations based on search term and sort order
  let filteredOrganizations = organizations.filter(
    (org) =>
      (org.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (org.domain?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (org.admin_email?.toLowerCase() || "").includes(
        searchTerm.toLowerCase()
      ) ||
      (org.current_plan?.toLowerCase() || "").includes(
        searchTerm.toLowerCase()
      )
  );

  if (sortBy) {
    filteredOrganizations.sort((a, b) => {
      const aValue = a[sortBy] || "";
      const bValue = b[sortBy] || "";
      const comparison = aValue.toString().localeCompare(bValue.toString());
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }

  const handleSort = (
    column: "name" | "domain" | "status" | "current_plan"
  ) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredOrganizations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredOrganizations.map((org) => org.id));
    }
  };

  const handleReload = () => {
    fetchOrganizations();
  };

  const openEditModal = () => {
    if (selectedIds.length === 1) {
      const org = organizations.find((o) => o.id === selectedIds[0]);
      if (org) {
        setEditOrganization(org);
        setIsEditModalOpen(true);
      }
    }
  };

  const handleDeleteOrganizations = async () => {
    setLoading(true);
    try {
      const deletePromises = selectedIds.map((id) =>
        fetch(`${API_BASE_URL}/api/organizations/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        })
      );

      const responses = await Promise.all(deletePromises);
      
      // Check if all deletions were successful
      const allSuccessful = responses.every(res => res.ok);
      
      if (!allSuccessful) {
        // At least one failed, show error
        const failedRes = responses.find(res => !res.ok);
        const errorData = await failedRes?.json();
        toast({
          title: "Error",
          description: errorData?.error || "Failed to delete one or more organizations.",
          variant: "destructive",
        });
        setLoading(false);
        setIsDeleteConfirmOpen(false);
        return;
      }

      setOrganizations(
        organizations.filter((org) => !selectedIds.includes(org.id))
      );
      setSelectedIds([]);
      toast({
        title: "Organizations Deleted",
        description: "Selected organizations have been deleted.",
      });
      setIsDeleteConfirmOpen(false);
    } catch (err) {
      console.error("[Organizations][Delete] Error:", err);
      toast({
        title: "Error",
        description: "Failed to delete organizations.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle add new organization
  const handleAddOrganization = async () => {
    if (!newOrganization.name) {
      toast({
        title: "Validation Error",
        description: "Organization name is required.",
        variant: "destructive",
      });
      return;
    }
    // Validate admin email/password
    if (!(newOrganization as any).admin_email || !(newOrganization as any).admin_password) {
      toast({
        title: "Validation Error",
        description: "Admin email and password are required.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/organizations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(newOrganization),
      });

      if (res.ok) {
        const createdOrg = await res.json();
        toast({
          title: "Organization Added",
          description: "Organization created successfully.",
        });
        setIsAddModalOpen(false);
        // Reset form
        setNewOrganization({
          name: "",
          domain: "",
          admin_name: "",
          admin_email: "",
          admin_password: "",
          status: "active",
          
        });
        // Reload organizations to fetch full details including admin_email
        fetchOrganizations();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to add organization.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to add organization.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle edit organization
  const handleEditOrganization = async () => {
    if (!editOrganization.name) {
      toast({
        title: "Validation Error",
        description: "Organization name is required.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/organizations/${editOrganization.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify(editOrganization),
        }
      );

      if (res.ok) {
        setOrganizations((organizations) =>
          organizations.map((o) =>
            o.id === editOrganization.id ? { ...o, ...editOrganization } : o
          )
        );
        toast({
          title: "Organization Updated",
          description: "Organization updated successfully.",
        });
        setIsEditModalOpen(false);
        
        // Refresh subscription status if organization status changed
        notifySubscriptionUpdate();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to update organization.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update organization.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case "basic":
        return "bg-blue-100 text-blue-800";
      case "premium":
        return "bg-purple-100 text-purple-800";
      case "enterprise":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Organization Management
          </h2>
          <p className="text-muted-foreground">
            Manage all organizations and their subscriptions.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-4">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
              <FilePlus2 className="mr-1 h-4 w-4" /> Add Organization
            </Button>
            <Button size="sm" variant="outline" onClick={handleReload}>
              <RefreshCw className="mr-1 h-4 w-4" /> Reload
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={openEditModal}
              disabled={selectedIds.length !== 1}
            >
              <Edit2 className="mr-1 h-4 w-4" /> Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setIsDeleteConfirmOpen(true)}
              disabled={selectedIds.length === 0}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center space-x-2">
          <Input
            ref={searchInputRef}
            placeholder="Search organizations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Organizations Table */}
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.length === filteredOrganizations.length &&
                        filteredOrganizations.length > 0
                      }
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("name")}
                      className="p-0 h-auto"
                    >
                      Name{" "}
                      {sortBy === "name" &&
                        (sortOrder === "asc" ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("domain")}
                      className="p-0 h-auto"
                    >
                      Domain{" "}
                      {sortBy === "domain" &&
                        (sortOrder === "asc" ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </Button>
                  </TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("current_plan")}
                      className="p-0 h-auto"
                    >
                      Plan{" "}
                      {sortBy === "current_plan" &&
                        (sortOrder === "asc" ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </Button>
                  </TableHead>
                  
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("status")}
                      className="p-0 h-auto"
                    >
                      Status{" "}
                      {sortBy === "status" &&
                        (sortOrder === "asc" ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </Button>
                  </TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrganizations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
                      No organizations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrganizations.map((org) => (
                    <TableRow
                      key={org.id}
                      className={selectedIds.includes(org.id) ? "bg-muted" : ""}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(org.id)}
                          onChange={() => toggleSelectRow(org.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{org.domain}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {org.admin_name ? org.admin_name : <span className="text-muted-foreground">-</span>}
                          <div className="text-xs text-muted-foreground">
                            {org.admin_email ? org.admin_email : "-"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPlanBadgeColor(org.current_plan || '')}>
                          {org.current_plan || "-"}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        <div
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            org.status === "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {org.status}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {new Date(org.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Organization Modal */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Organization</DialogTitle>
              <DialogDescription>
                Enter the details for the new organization.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Organization Name *</Label>
                  <Input
                    id="name"
                    value={newOrganization.name}
                    onChange={(e) =>
                      setNewOrganization({
                        ...newOrganization,
                        name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Input
                    id="domain"
                    value={newOrganization.domain}
                    onChange={(e) =>
                      setNewOrganization({
                        ...newOrganization,
                        domain: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin_name">Admin Name</Label>
                <Input
                  id="admin_name"
                  value={newOrganization.admin_name}
                  onChange={(e) =>
                    setNewOrganization({
                      ...newOrganization,
                      admin_name: e.target.value,
                    })
                  }
                />
              </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin_email">Admin Email *</Label>
                    <Input
                      id="admin_email"
                      type="email"
                      value={(newOrganization as any).admin_email || ''}
                      onChange={(e) =>
                        setNewOrganization({
                          ...newOrganization,
                          admin_email: e.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      This email will be created as the organization admin account.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin_password">Admin Password *</Label>
                    <div className="relative">
                      <Input
                        id="admin_password"
                        type={showAdminPassword ? 'text' : 'password'}
                        value={(newOrganization as any).admin_password || ''}
                        onChange={(e) =>
                          setNewOrganization({
                            ...newOrganization,
                            admin_password: e.target.value,
                          })
                        }
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                        tabIndex={-1}
                      >
                        {showAdminPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span className="sr-only">
                          {showAdminPassword ? 'Hide password' : 'Show password'}
                        </span>
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Initial admin password. Can be changed later.
                    </p>
                  </div>
                </div>
                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger className="text-sm text-primary hover:underline">Advanced options</CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-3 space-y-3">
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              
              <div className="flex items-center space-x-2">
                <Label htmlFor="status">Active</Label>
                <Switch
                  id="status"
                  checked={newOrganization.status === "active"}
                  onCheckedChange={(checked) =>
                    setNewOrganization({
                      ...newOrganization,
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
              <Button onClick={handleAddOrganization} disabled={loading}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Organization Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Organization</DialogTitle>
              <DialogDescription>
                Update the organization details.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Organization Name *</Label>
                  <Input
                    id="edit-name"
                    value={editOrganization.name || ""}
                    onChange={(e) =>
                      setEditOrganization({
                        ...editOrganization,
                        name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-domain">Domain</Label>
                  <Input
                    id="edit-domain"
                    value={editOrganization.domain || ""}
                    onChange={(e) =>
                      setEditOrganization({
                        ...editOrganization,
                        domain: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-admin-name">Admin Name</Label>
                <Input
                  id="edit-admin-name"
                  value={editOrganization.admin_name || ""}
                  onChange={(e) =>
                    setEditOrganization({
                      ...editOrganization,
                      admin_name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="edit-status">Active</Label>
                <Switch
                  id="edit-status"
                  checked={editOrganization.status === "active"}
                  onCheckedChange={(checked) =>
                    setEditOrganization({
                      ...editOrganization,
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
              <Button onClick={handleEditOrganization} disabled={loading}>
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
              <DialogTitle>Delete Organizations</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedIds.length}{" "}
                organization(s)? This action cannot be undone.
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
                onClick={handleDeleteOrganizations}
                disabled={loading}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default AdminOrganizationsPage;
