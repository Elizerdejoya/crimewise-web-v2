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
  CreditCard,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/lib/config";

// Define subscription type
type Subscription = {
  id: number;
  organization_id: number;
  organization_name: string;
  domain: string;
  plan_name: string;
  status: "active" | "inactive";
  start_date: string;
  end_date: string;
  monthly_price: number;
  features: string;
  created_at: string;
};

const AdminSubscriptionsPage = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortBy, setSortBy] = useState<
    "organization_name" | "plan_name" | "status" | "monthly_price" | null
  >(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [newSubscription, setNewSubscription] = useState<Partial<Subscription>>(
    {
      organization_id: 0,
      plan_name: "basic",
      status: "active",
      start_date: new Date().toISOString().split("T")[0],
      monthly_price: 49.99,
    }
  );
  const [editSubscription, setEditSubscription] = useState<
    Partial<Subscription>
  >({});

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch data from backend
  useEffect(() => {
    fetchSubscriptions();
    fetchOrganizations();
    fetchAvailablePlans();
  }, []);

  const fetchSubscriptions = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/subscriptions`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setSubscriptions(data);
        setLoading(false);
      })
      .catch((err) => {
        toast({
          title: "Error",
          description: "Failed to fetch subscriptions.",
          variant: "destructive",
        });
        console.error("[Subscriptions][Fetch] Error:", err);
        setLoading(false);
      });
  };

  const fetchOrganizations = () => {
    fetch(`${API_BASE_URL}/api/organizations`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setOrganizations(data);
      })
      .catch((err) => {
        console.error("[Organizations][Fetch] Error:", err);
      });
  };

  const fetchAvailablePlans = () => {
    fetch(`${API_BASE_URL}/api/subscriptions/plans/available`)
      .then((res) => res.json())
      .then((data) => {
        setAvailablePlans(data);
      })
      .catch((err) => {
        console.error("[Plans][Fetch] Error:", err);
      });
  };

  // Filter and sort subscriptions based on search term and sort order
  let filteredSubscriptions = subscriptions.filter(
    (sub) =>
      (sub.organization_name?.toLowerCase() || "").includes(
        searchTerm.toLowerCase()
      ) ||
      (sub.domain?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (sub.plan_name?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  if (sortBy) {
    filteredSubscriptions.sort((a, b) => {
      const aValue = a[sortBy] || "";
      const bValue = b[sortBy] || "";
      const comparison = aValue.toString().localeCompare(bValue.toString());
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }

  const handleSort = (
    column: "organization_name" | "plan_name" | "status" | "monthly_price"
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
    if (selectedIds.length === filteredSubscriptions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSubscriptions.map((sub) => sub.id));
    }
  };

  const handleReload = () => {
    fetchSubscriptions();
  };

  const openEditModal = () => {
    if (selectedIds.length === 1) {
      const sub = subscriptions.find((s) => s.id === selectedIds[0]);
      if (sub) {
        setEditSubscription(sub);
        setIsEditModalOpen(true);
      }
    }
  };

  const handleDeleteSubscriptions = async () => {
    setLoading(true);
    try {
      const deletePromises = selectedIds.map((id) =>
        fetch(`${API_BASE_URL}/api/subscriptions/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        })
      );

      await Promise.all(deletePromises);

      setSubscriptions(
        subscriptions.filter((sub) => !selectedIds.includes(sub.id))
      );
      setSelectedIds([]);
      toast({
        title: "Subscriptions Deleted",
        description: "Selected subscriptions have been deleted.",
      });
      setIsDeleteConfirmOpen(false);
    } catch (err) {
      console.error("[Subscriptions][Delete] Error:", err);
      toast({
        title: "Error",
        description: "Failed to delete subscriptions.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle add new subscription
  const handleAddSubscription = async () => {
    if (
      !newSubscription.organization_id ||
      !newSubscription.plan_name ||
      !newSubscription.start_date
    ) {
      toast({
        title: "Validation Error",
        description: "Organization, plan name, and start date are required.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const selectedPlan = availablePlans.find(
        (p) => p.name === newSubscription.plan_name
      );
      const features = selectedPlan ? selectedPlan.features : [];

      const res = await fetch(`${API_BASE_URL}/api/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          ...newSubscription,
          features,
        }),
      });

      if (res.ok) {
        const createdSub = await res.json();
        setSubscriptions([...subscriptions, createdSub]);
        toast({
          title: "Subscription Added",
          description: "Subscription created successfully.",
        });
        setIsAddModalOpen(false);
        // Reset form
        setNewSubscription({
          organization_id: 0,
          plan_name: "basic",
          status: "active",
          start_date: new Date().toISOString().split("T")[0],
          monthly_price: 49.99,
        });
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to add subscription.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to add subscription.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle edit subscription
  const handleEditSubscription = async () => {
    if (!editSubscription.plan_name || !editSubscription.start_date) {
      toast({
        title: "Validation Error",
        description: "Plan name and start date are required.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const selectedPlan = availablePlans.find(
        (p) => p.name === editSubscription.plan_name
      );
      const features = selectedPlan ? selectedPlan.features : [];

      const res = await fetch(
        `${API_BASE_URL}/api/subscriptions/${editSubscription.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            ...editSubscription,
            features,
          }),
        }
      );

      if (res.ok) {
        setSubscriptions((subscriptions) =>
          subscriptions.map((s) =>
            s.id === editSubscription.id ? { ...s, ...editSubscription } : s
          )
        );
        toast({
          title: "Subscription Updated",
          description: "Subscription updated successfully.",
        });
        setIsEditModalOpen(false);
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.error || "Failed to update subscription.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update subscription.",
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

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "inactive":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handlePlanChange = (planName: string) => {
    const selectedPlan = availablePlans.find((p) => p.name === planName);
    if (selectedPlan) {
      setNewSubscription({
        ...newSubscription,
        plan_name: planName,
        monthly_price: selectedPlan.price,
      });
    }
  };

  const handleEditPlanChange = (planName: string) => {
    const selectedPlan = availablePlans.find((p) => p.name === planName);
    if (selectedPlan) {
      setEditSubscription({
        ...editSubscription,
        plan_name: planName,
        monthly_price: selectedPlan.price,
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Subscription Management
          </h2>
          <p className="text-muted-foreground">
            Manage all organization subscriptions and billing.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-4">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
              <FilePlus2 className="mr-1 h-4 w-4" /> Add Subscription
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
            placeholder="Search subscriptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Subscriptions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.length === filteredSubscriptions.length &&
                        filteredSubscriptions.length > 0
                      }
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("organization_name")}
                      className="p-0 h-auto"
                    >
                      Organization{" "}
                      {sortBy === "organization_name" &&
                        (sortOrder === "asc" ? (
                          <ArrowUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ArrowDown className="ml-1 h-3 w-3" />
                        ))}
                    </Button>
                  </TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("plan_name")}
                      className="p-0 h-auto"
                    >
                      Plan{" "}
                      {sortBy === "plan_name" &&
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
                      onClick={() => handleSort("monthly_price")}
                      className="p-0 h-auto"
                    >
                      Price{" "}
                      {sortBy === "monthly_price" &&
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
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center">
                      No subscriptions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubscriptions.map((sub) => (
                    <TableRow
                      key={sub.id}
                      className={selectedIds.includes(sub.id) ? "bg-muted" : ""}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(sub.id)}
                          onChange={() => toggleSelectRow(sub.id)}
                        />
                      </TableCell>
                      <TableCell>{sub.id}</TableCell>
                      <TableCell className="font-medium">
                        {sub.organization_name}
                      </TableCell>
                      <TableCell>{sub.domain}</TableCell>
                      <TableCell>
                        <Badge className={getPlanBadgeColor(sub.plan_name)}>
                          {sub.plan_name}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          ₱‎{sub.monthly_price}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadgeColor(sub.status)}>
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {new Date(sub.start_date).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {sub.end_date
                            ? new Date(sub.end_date).toLocaleDateString()
                            : "Ongoing"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add Subscription Modal */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Subscription</DialogTitle>
              <DialogDescription>
                Create a new subscription for an organization.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organization">Organization *</Label>
                <Select
                  value={newSubscription.organization_id?.toString() || ""}
                  onValueChange={(value) =>
                    setNewSubscription({
                      ...newSubscription,
                      organization_id: parseInt(value),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id.toString()}>
                        {org.name} ({org.domain})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan">Subscription Plan *</Label>
                  <Select
                    value={newSubscription.plan_name}
                    onValueChange={handlePlanChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePlans.map((plan) => (
                        <SelectItem key={plan.name} value={plan.name}>
                          {plan.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Monthly Price</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={newSubscription.monthly_price}
                    onChange={(e) =>
                      setNewSubscription({
                        ...newSubscription,
                        monthly_price: parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={newSubscription.start_date}
                    onChange={(e) =>
                      setNewSubscription({
                        ...newSubscription,
                        start_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={newSubscription.end_date}
                    onChange={(e) =>
                      setNewSubscription({
                        ...newSubscription,
                        end_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="status">Active</Label>
                <Switch
                  id="status"
                  checked={newSubscription.status === "active"}
                  onCheckedChange={(checked) =>
                    setNewSubscription({
                      ...newSubscription,
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
              <Button onClick={handleAddSubscription} disabled={loading}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Subscription Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Subscription</DialogTitle>
              <DialogDescription>
                Update the subscription details.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-organization">Organization</Label>
                <Input
                  id="edit-organization"
                  value={editSubscription.organization_name || ""}
                  disabled
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-plan">Subscription Plan *</Label>
                  <Select
                    value={editSubscription.plan_name || ""}
                    onValueChange={handleEditPlanChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePlans.map((plan) => (
                        <SelectItem key={plan.name} value={plan.name}>
                          {plan.display_name} - ${plan.price}/month
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Monthly Price</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    step="0.01"
                    value={editSubscription.monthly_price || 0}
                    onChange={(e) =>
                      setEditSubscription({
                        ...editSubscription,
                        monthly_price: parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-start-date">Start Date *</Label>
                  <Input
                    id="edit-start-date"
                    type="date"
                    value={editSubscription.start_date || ""}
                    onChange={(e) =>
                      setEditSubscription({
                        ...editSubscription,
                        start_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-end-date">End Date</Label>
                  <Input
                    id="edit-end-date"
                    type="date"
                    value={editSubscription.end_date || ""}
                    onChange={(e) =>
                      setEditSubscription({
                        ...editSubscription,
                        end_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="edit-status">Active</Label>
                <Switch
                  id="edit-status"
                  checked={editSubscription.status === "active"}
                  onCheckedChange={(checked) =>
                    setEditSubscription({
                      ...editSubscription,
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
              <Button onClick={handleEditSubscription} disabled={loading}>
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
              <DialogTitle>Delete Subscriptions</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedIds.length}{" "}
                subscription(s)? This action cannot be undone.
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
                onClick={handleDeleteSubscriptions}
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

export default AdminSubscriptionsPage;
