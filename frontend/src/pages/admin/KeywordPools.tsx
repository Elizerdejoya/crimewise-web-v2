import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Loading from "@/components/ui/Loading";
import { Plus, Edit, Trash2, Search, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { API_BASE_URL } from "@/lib/config";
import { getAuthHeaders } from "@/pages/admin/components/question-bank/utils";
import DashboardLayout from "@/components/layout/DashboardLayout";
import KeywordPoolManager from "@/pages/admin/components/question-bank/KeywordPoolManager";
import { useNavigate } from "react-router-dom";

interface KeywordPool {
  id: number;
  name: string;
  keywords: string[];
  description?: string;
  created_by_name?: string;
  created?: string;
}

const KeywordPools: React.FC = () => {
  const [pools, setPools] = useState<KeywordPool[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<KeywordPool | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Load keyword pools
  const loadPools = async () => {
    try {
      setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPools();
  }, []);

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

  const handleEditPool = (pool: KeywordPool) => {
    setEditingPool(pool);
    setIsManagerOpen(true);
  };

  const handleCreatePool = () => {
    setEditingPool(null);
    setIsManagerOpen(true);
  };

  const handleManagerClose = () => {
    setIsManagerOpen(false);
    setEditingPool(null);
    loadPools(); // Reload pools after any changes
  };

  // Filter pools based on search term
  const filteredPools = pools.filter(pool =>
    pool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pool.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pool.keywords.some(keyword => 
      keyword.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <Loading fullScreen message="Loading keyword pools..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Keyword Pools</h1>
            <p className="text-gray-600 mt-1">
              Manage keyword pools for question creation and evaluation
            </p>
            <p className="text-sm text-gray-500 mt-1">
              💡 After creating/editing pools, return to Question Bank to use them in questions
            </p>
          </div>
          <Button onClick={handleCreatePool} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Pool
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search keyword pools..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Pools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pools.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Keywords</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {pools.reduce((sum, pool) => sum + pool.keywords.length, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Average Keywords/Pool</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {pools.length > 0 
                  ? Math.round(pools.reduce((sum, pool) => sum + pool.keywords.length, 0) / pools.length)
                  : 0
                }
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Keyword Pools Grid */}
        {filteredPools.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {searchTerm ? "No matching pools found" : "No keyword pools yet"}
                </h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm 
                    ? "Try adjusting your search terms"
                    : "Create your first keyword pool to get started"
                  }
                </p>
                {!searchTerm && (
                  <Button onClick={handleCreatePool} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Your First Pool
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPools.map((pool) => (
              <Card key={pool.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{pool.name}</CardTitle>
                      {pool.description && (
                        <CardDescription className="mt-1">
                          {pool.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditPool(pool)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePool(pool.id)}
                        className="text-gray-500 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Keywords ({pool.keywords.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {pool.keywords.slice(0, 6).map((keyword, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {pool.keywords.length > 6 && (
                          <Badge variant="outline" className="text-xs">
                            +{pool.keywords.length - 6} more
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 pt-2 border-t">
                      Created by {pool.created_by_name}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Keyword Pool Manager Dialog */}
      <KeywordPoolManager
        isOpen={isManagerOpen}
        onOpenChange={handleManagerClose}
        initialPool={editingPool}
      />
    </DashboardLayout>
  );
};

export default KeywordPools;
