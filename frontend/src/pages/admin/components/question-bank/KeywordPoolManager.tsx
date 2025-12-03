import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { X, Plus, Edit, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { getAuthHeaders } from "./utils";

interface KeywordPool {
  id: number;
  name: string;
  keywords: string[];
  description?: string;
  created_by_name?: string;
  created?: string;
}

interface KeywordPoolManagerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onPoolSelected?: (pool: KeywordPool) => void;
  selectMode?: boolean;
  initialPool?: KeywordPool | null;
}

const KeywordPoolManager: React.FC<KeywordPoolManagerProps> = ({
  isOpen,
  onOpenChange,
  onPoolSelected,
  selectMode = false,
  initialPool = null,
}) => {
  const [pools, setPools] = useState<KeywordPool[]>([]);
  const [selectedPool, setSelectedPool] = useState<KeywordPool | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    keywords: [] as string[],
  });
  const { toast } = useToast();

  // Load keyword pools
  const loadPools = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/keyword-pools`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setPools(data);
      } else {
        toast({
          title: "Error",
          description: "Failed to load keyword pools",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load keyword pools",
        variant: "destructive",
      });
      console.error("[Keyword Pools][Load] Error:", error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPools();
      // If we have an initial pool, start editing it
      if (initialPool) {
        setSelectedPool(initialPool);
        setIsEditing(true);
        setForm({
          name: initialPool.name,
          description: initialPool.description || "",
          keywords: [...initialPool.keywords],
        });
      }
    }
  }, [isOpen, initialPool]);

  const handleCreatePool = async () => {
    if (!form.name.trim() || form.keywords.length === 0) {
      toast({
        title: "Validation Error",
        description: "Name and at least one keyword are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/keyword-pools`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          keywords: form.keywords,
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Keyword pool created successfully",
        });
        resetForm();
        setIsCreating(false);
        loadPools();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to create keyword pool",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create keyword pool",
        variant: "destructive",
      });
      console.error("[Keyword Pools][Create] Error:", error);
    }
  };

  const handleUpdatePool = async () => {
    if (!selectedPool || !form.name.trim() || form.keywords.length === 0) {
      toast({
        title: "Validation Error",
        description: "Name and at least one keyword are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/keyword-pools/${selectedPool.id}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            keywords: form.keywords,
          }),
        }
      );

      if (response.ok) {
        toast({
          title: "Success",
          description: "Keyword pool updated successfully",
        });
        resetForm();
        setIsEditing(false);
        setSelectedPool(null);
        loadPools();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to update keyword pool",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update keyword pool",
        variant: "destructive",
      });
      console.error("[Keyword Pools][Update] Error:", error);
    }
  };

  const handleDeletePool = async (poolId: number) => {
    if (!confirm("Are you sure you want to delete this keyword pool?")) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/keyword-pools/${poolId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      if (response.ok) {
        toast({
          title: "Success",
          description: "Keyword pool deleted successfully",
        });
        loadPools();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to delete keyword pool",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete keyword pool",
        variant: "destructive",
      });
      console.error("[Keyword Pools][Delete] Error:", error);
    }
  };

  const handleSelectPool = (pool: KeywordPool) => {
    if (selectMode && onPoolSelected) {
      onPoolSelected(pool);
      onOpenChange(false);
    } else {
      setSelectedPool(pool);
      setIsEditing(true);
      setForm({
        name: pool.name,
        description: pool.description || "",
        keywords: [...pool.keywords],
      });
    }
  };

  const handleEditPool = (pool: KeywordPool) => {
    setSelectedPool(pool);
    setIsEditing(true);
    setForm({
      name: pool.name,
      description: pool.description || "",
      keywords: [...pool.keywords],
    });
  };

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      keywords: [],
    });
    setNewKeyword("");
    setIsEditing(false);
    setIsCreating(false);
    setSelectedPool(null);
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !form.keywords.includes(newKeyword.trim())) {
      setForm({
        ...form,
        keywords: [...form.keywords, newKeyword.trim()],
      });
      setNewKeyword("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setForm({
      ...form,
      keywords: form.keywords.filter((k) => k !== keyword),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addKeyword();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectMode ? "Select Keyword Pool" : "Manage Keyword Pools"}
          </DialogTitle>
          <DialogDescription>
            {selectMode
              ? "Choose a keyword pool to use for your question"
              : "Create and manage keyword pools for questions"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!selectMode && (
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Keyword Pools</h3>
              <Button
                onClick={() => {
                  resetForm();
                  setIsCreating(true);
                }}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Pool
              </Button>
            </div>
          )}

          {/* Create/Edit Form */}
          {(isCreating || isEditing) && (
            <div className="border rounded-lg p-4 space-y-4 bg-gray-100">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold">
                  {isCreating ? "Create New Pool" : "Edit Pool"}
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                  className="text-gray-500"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pool-name">Pool Name</Label>
                <Input
                  id="pool-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="Enter pool name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pool-description">Description (Optional)</Label>
                <Textarea
                  id="pool-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Enter description"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Enter keyword and press Enter"
                  />
                  <Button onClick={addKeyword} disabled={!newKeyword.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.keywords.map((keyword, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {keyword}
                      <button
                        onClick={() => removeKeyword(keyword)}
                        className="ml-1 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={isCreating ? handleCreatePool : handleUpdatePool}
                  disabled={!form.name.trim() || form.keywords.length === 0}
                >
                  {isCreating ? "Create Pool" : "Update Pool"}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Pools List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pools.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No keyword pools found. Create your first pool to get started.
              </div>
            ) : (
              pools.map((pool) => (
                <div
                  key={pool.id}
                  className="border rounded-lg p-4 hover:bg-gray-100 cursor-pointer"
                  onClick={() => handleSelectPool(pool)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">
                        {pool.name}
                      </h4>
                      {pool.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {pool.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {pool.keywords.slice(0, 5).map((keyword, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {pool.keywords.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{pool.keywords.length - 5} more
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Created by {pool.created_by_name} • {pool.keywords.length}{" "}
                        keywords
                      </p>
                    </div>
                    {!selectMode && (
                      <div className="flex gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditPool(pool);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePool(pool.id);
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {selectMode ? "Cancel" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default KeywordPoolManager;
