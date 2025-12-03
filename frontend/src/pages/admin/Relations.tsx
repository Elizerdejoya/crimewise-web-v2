import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

// Define types for grouped relations
type GroupedClassInstructorRelation = {
  id: string;
  class: string;
  instructors: { name: string; id: number; relationId: number }[];
  relationIds: number[];
};

type GroupedBatchCourseRelation = {
  id: string;
  batch: string;
  courses: { name: string; id: number; relationId: number }[];
  relationIds: number[];
};

type GroupedInstructorCourseRelation = {
  id: string;
  instructor: string;
  courses: { name: string; id: number; relationId: number }[];
  relationIds: number[];
};

const RelationsPage = () => {
  // Entities
  const [batches, setBatches] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [instructors, setInstructors] = useState<any[]>([]);

  // Relations
  const [classInstructorRelations, setClassInstructorRelations] = useState<
    any[]
  >([]);
  const [batchCourseRelations, setBatchCourseRelations] = useState<any[]>([]);
  const [instructorCourseRelations, setInstructorCourseRelations] = useState<
    any[]
  >([]);

  // Selected for editing
  const [selectedRelation, setSelectedRelation] = useState<any>(null);
  const [editMode, setEditMode] = useState<string | null>(null); // 'classInstructor', 'batchCourse', or 'instructorCourse'

  // Forms
  const [classInstructorForm, setClassInstructorForm] = useState({
    class: "",
    instructor: "",
  });

  const [batchCourseForm, setBatchCourseForm] = useState({
    batch: "",
    course: "",
  });

  const [instructorCourseForm, setInstructorCourseForm] = useState({
    instructor: "",
    course: "",
  });


  const { toast } = useToast();
  const currentUser = getCurrentUser();

  // Group class-instructor relations by class and combine instructors
  const groupedClassInstructorRelations = useMemo(() => {
    console.log('Grouping class-instructor relations:', classInstructorRelations);
    
    return classInstructorRelations.reduce((acc, relation) => {
      // Get IDs consistently, handling both string and number types
      const classId = String(relation.classId || relation.class_id);
      const className = relation.class || 
        classes.find(c => String(c.id) === classId)?.name ||
        classId;

      if (!acc[classId]) {
        acc[classId] = {
          id: classId,
          class: className,
          instructors: [],
          relationIds: [],
        };
      }

      // Only add instructor if not already present
      const instructorId = String(relation.instructorId || relation.instructor_id);
      const instructorExists = acc[classId].instructors.some(i => String(i.id) === instructorId);
      
      if (!instructorExists) {
        acc[classId].instructors.push({
          name: relation.instructor || 
            instructors.find(i => String(i.id) === instructorId)?.email ||
            instructorId,
          id: instructorId,
          relationId: relation.id
        });
        acc[classId].relationIds.push(relation.id);
      }

      return acc;
    }, {} as Record<string, GroupedClassInstructorRelation>);
  }, [classInstructorRelations, classes, instructors]);

  // Group batch-course relations by batch and combine courses
  const groupedBatchCourseRelations = useMemo(() => {
    return batchCourseRelations.reduce((acc, relation) => {
      const batchId = String(relation.batchId || relation.batch_id);
      const batchName = relation.batch || 
        batches.find(b => String(b.id) === batchId)?.name ||
        batchId;

      if (!acc[batchId]) {
        acc[batchId] = {
          id: batchId,
          batch: batchName,
          courses: [],
          relationIds: [],
        };
      }

      // Only add course if not already present
      const courseId = String(relation.courseId || relation.course_id);
      const courseExists = acc[batchId].courses.some(c => String(c.id) === courseId);

      if (!courseExists) {
        acc[batchId].courses.push({
          name: relation.course || 
            courses.find(c => String(c.id) === courseId)?.name ||
            courseId,
          id: courseId,
          relationId: relation.id
        });
        acc[batchId].relationIds.push(relation.id);
      }

      return acc;
    }, {} as Record<string, GroupedBatchCourseRelation>);
  }, [batchCourseRelations, batches, courses]);

  // Group instructor-course relations by instructor and combine courses
  const groupedInstructorCourseRelations = useMemo(() => {
    return instructorCourseRelations.reduce((acc, relation) => {
      const instructorId = String(relation.instructorId || relation.instructor_id);
      const instructorName = relation.instructor || 
        instructors.find(i => String(i.id) === instructorId)?.email ||
        instructorId;

      if (!acc[instructorId]) {
        acc[instructorId] = {
          id: instructorId,
          instructor: instructorName,
          courses: [],
          relationIds: [],
        };
      }

      // Only add course if not already present
      const courseId = String(relation.courseId || relation.course_id);
      const courseExists = acc[instructorId].courses.some(c => String(c.id) === courseId);

      if (!courseExists) {
        acc[instructorId].courses.push({
          name: relation.course || 
            courses.find(c => String(c.id) === courseId)?.name ||
            courseId,
          id: courseId,
          relationId: relation.id
        });
        acc[instructorId].relationIds.push(relation.id);
      }

      return acc;
    }, {} as Record<string, GroupedInstructorCourseRelation>);
  }, [instructorCourseRelations, instructors, courses]);

  const handleSelectChange = (
    formType: string,
    field: string,
    value: string
  ) => {
    console.log(`Changing ${formType} ${field} to ${value}`);
    console.log('Before change - Form state:', { classInstructorForm, editMode, selectedRelation });
    
    switch (formType) {
      case "classInstructor":
        if (field === 'class') {
          console.log('Setting class to:', value);
          // When changing class, reset instructor and update form
          setClassInstructorForm({
            class: value,
            instructor: '',
          });
          // Also reset edit mode if we're selecting a different class
          if (editMode === "classInstructor" && selectedRelation?.id !== value) {
            setEditMode(null);
            setSelectedRelation(null);
          }
        } else {
          console.log('Setting instructor to:', value);
          setClassInstructorForm(prev => ({
            ...prev,
            [field]: value,
          }));
        }
        break;
      case "batchCourse":
        setBatchCourseForm({
          ...batchCourseForm,
          [field]: value,
        });
        break;
      case "instructorCourse":
        setInstructorCourseForm({
          ...instructorCourseForm,
          [field]: value,
        });
        break;
    }
  };

  // Fetch all entities and relations on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const headers = getAuthHeaders();

      const [
        batchesRes,
        classesRes,
        coursesRes,
        instructorsRes,
        classInstructorRes,
        batchCourseRes,
        instructorCourseRes
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/api/batches`, { cache: "no-store", headers }),
        fetch(`${API_BASE_URL}/api/classes`, { cache: "no-store", headers }),
        fetch(`${API_BASE_URL}/api/courses`, { cache: "no-store", headers }),
        fetch(`${API_BASE_URL}/api/instructors`, { cache: "no-store", headers }),
        fetch(`${API_BASE_URL}/api/relations/class-instructor`, { cache: "no-store", headers }),
        fetch(`${API_BASE_URL}/api/relations/batch-course`, { cache: "no-store", headers }),
        fetch(`${API_BASE_URL}/api/relations/instructor-course`, { cache: "no-store", headers })
      ]);

      if (!classInstructorRes.ok || !batchCourseRes.ok || !instructorCourseRes.ok) {
        throw new Error('Failed to fetch relations data');
      }

      const [
        batchesData,
        classesData,
        coursesData,
        instructorsData,
        classInstructorData,
        batchCourseData,
        instructorCourseData
      ] = await Promise.all([
        batchesRes.json(),
        classesRes.json(),
        coursesRes.json(),
        instructorsRes.json(),
        classInstructorRes.json(),
        batchCourseRes.json(),
        instructorCourseRes.json()
      ]);

      if (Array.isArray(batchesData)) setBatches(batchesData);
      if (Array.isArray(classesData)) setClasses(classesData);
      if (Array.isArray(coursesData)) setCourses(coursesData);
      if (Array.isArray(instructorsData)) setInstructors(instructorsData);
      if (Array.isArray(classInstructorData)) setClassInstructorRelations(classInstructorData);
      if (Array.isArray(batchCourseData)) setBatchCourseRelations(batchCourseData);
      if (Array.isArray(instructorCourseData)) setInstructorCourseRelations(instructorCourseData);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch data. Please refresh the page.",
        variant: "destructive",
      });
    }
  };

  // Set up editing mode
  const handleEditRelation = (relationType: string, relation: any) => {
    console.log('Setting up edit mode:', { relationType, relation });
    
    setEditMode(relationType);
    setSelectedRelation(relation);

    switch (relationType) {
      case "classInstructor":
        // Clear instructor selection but keep the selected class
        const classId = relation.id || relation.classId;
        console.log('Setting class ID in edit mode:', classId);
        setClassInstructorForm({
          class: String(classId),
          instructor: "",
        });
        break;
      case "batchCourse":
        // Find the batch ID from the batches array using the batch name
        const batchObj = batches.find(b => b.name === relation.batch);
        setBatchCourseForm({
          batch: batchObj ? String(batchObj.id) : "",
          course: "",
        });
        break;
      case "instructorCourse":
        // Find the instructor ID from the instructors array using the instructor email
        const instructorObj = instructors.find(i => i.email === relation.instructor);
        setInstructorCourseForm({
          instructor: instructorObj ? String(instructorObj.id) : "",
          course: "",
        });
        break;
    }
  };

  // Reset all forms
  const resetForms = () => {
    setEditMode(null);
    setSelectedRelation(null);
    setClassInstructorForm({ class: "", instructor: "" });
    setBatchCourseForm({ batch: "", course: "" });
    setInstructorCourseForm({ instructor: "", course: "" });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    resetForms();
  };


  // Add relation handlers (POST)
  const handleAddClassInstructor = async () => {
    // Always use the form's class value for consistency
    const classId = classInstructorForm.class;
    console.log('Adding instructor to class:', {
      classId,
      selectedClass: classes.find(c => String(c.id) === String(classId))?.name,
      instructorId: classInstructorForm.instructor,
      selectedInstructor: instructors.find(i => String(i.id) === String(classInstructorForm.instructor))?.email,
      editMode,
      selectedRelation
    });

    if (!classId || !classInstructorForm.instructor) {
      toast({
        title: "Error",
        description: "Please select both class and instructor",
        variant: "destructive",
      });
      return;
    }

    // Verify the class exists
    const classExists = classes.some(c => String(c.id) === String(classId));
    if (!classExists) {
      toast({
        title: "Error",
        description: "Selected class not found. Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Check if relation already exists
    const existingRelation = classInstructorRelations.find(
      (r) => String(r.classId) === String(classId) && 
             String(r.instructorId) === String(classInstructorForm.instructor)
    );

    if (existingRelation) {
      toast({
        title: "Error",
        description: "This class-instructor assignment already exists",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      classId: classId,
      instructorId: classInstructorForm.instructor,
    };

    // Always create new relation (no edit mode for grouped relations)
    const res = await fetch(`${API_BASE_URL}/api/relations/class-instructor`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      try {
        const newRelation = await res.json();
        console.log('New relation created:', newRelation);
        
        // Ensure we have class and instructor names for the new relation
        const classObj = classes.find(c => String(c.id) === String(classId));
        const instructorObj = instructors.find(i => String(i.id) === String(classInstructorForm.instructor));
        
        if (!classObj || !instructorObj) {
          throw new Error('Could not find class or instructor details');
        }

        // Create the enriched relation with all required data
        const enrichedRelation = {
          id: newRelation.id,
          classId: String(classId),
          instructorId: String(classInstructorForm.instructor),
          class: classObj.name,
          instructor: instructorObj.email,
          // Add any other fields that your table expects
        };
        
        // Update local state first for immediate feedback
        setClassInstructorRelations(prev => {
          console.log('Updating relations:', {
            previous: prev,
            newRelation: enrichedRelation
          });
          return [...prev, enrichedRelation];
        });
        
        // Then fetch fresh data to ensure everything is in sync
        await fetchAllData();
        
        resetForms();
        toast({
          title: "Success",
          description: `Added ${instructorObj.email} to ${classObj.name}`,
        });
      } catch (error) {
        console.error('Error processing new relation:', error);
        // Fetch fresh data even on error to ensure state is consistent
        await fetchAllData();
        toast({
          title: "Warning",
          description: "Please verify the assignment was created correctly.",
          variant: "default",
        });
      }
    } else {
      const errorData = await res.json().catch(() => ({}));
      toast({
        title: "Error",
        description: errorData.message || "Failed to add relation",
        variant: "destructive",
      });
    }
  };

  const handleAddBatchCourse = async () => {
    if (!batchCourseForm.batch || !batchCourseForm.course) {
      toast({
        title: "Error",
        description: "Please select both batch and course",
        variant: "destructive",
      });
      return;
    }

    // Check if relation already exists
    const existingRelation = batchCourseRelations.find(
      (r) => String(r.batchId) === String(batchCourseForm.batch) && 
             String(r.courseId) === String(batchCourseForm.course)
    );

    if (existingRelation) {
      toast({
        title: "Error",
        description: "This batch-course assignment already exists",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      batchId: batchCourseForm.batch,
      courseId: batchCourseForm.course,
    };

    // Always create new relation (no edit mode for grouped relations)
    const res = await fetch(`${API_BASE_URL}/api/relations/batch-course`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const newRelation = await res.json();
      await fetchAllData(); // Refresh all data
      resetForms();
      toast({
        title: "Relation Added",
        description: "Batch-course assignment created.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to add relation",
        variant: "destructive",
      });
    }
  };

  const handleAddInstructorCourse = async () => {
    if (!instructorCourseForm.instructor || !instructorCourseForm.course) {
      toast({
        title: "Error",
        description: "Please select both instructor and course",
        variant: "destructive",
      });
      return;
    }

    // Check if relation already exists
    const existingRelation = instructorCourseRelations.find(
      (r) => String(r.instructorId) === String(instructorCourseForm.instructor) && 
             String(r.courseId) === String(instructorCourseForm.course)
    );

    if (existingRelation) {
      toast({
        title: "Error",
        description: "This instructor-course assignment already exists",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      instructorId: instructorCourseForm.instructor,
      courseId: instructorCourseForm.course,
    };

    // Always create new relation (no edit mode for grouped relations)
    const res = await fetch(`${API_BASE_URL}/api/relations/instructor-course`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const newRelation = await res.json();
      await fetchAllData(); // Refresh all data
      resetForms();
      toast({
        title: "Relation Added",
        description: "Instructor-course assignment created.",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to add relation",
        variant: "destructive",
      });
    }
  };

  // Delete relation handlers (DELETE)
  const handleDeleteClassInstructor = async (id: number) => {
    const res = await fetch(
      `${API_BASE_URL}/api/relations/class-instructor/${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setClassInstructorRelations(
        classInstructorRelations.filter((r) => r.id !== id)
      );
      toast({
        title: "Relation Removed",
        description: "The class-instructor assignment has been removed.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to remove relation",
        variant: "destructive",
      });
    }
  };

  // Remove individual instructor from class
  const handleRemoveInstructor = async (relationId: number, instructorName: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/relations/class-instructor/${relationId}`,
        { 
          method: "DELETE",
          headers: getAuthHeaders()
        }
      );
      
      if (res.ok) {
        setClassInstructorRelations(
          classInstructorRelations.filter((r) => r.id !== relationId)
        );
        toast({
          title: "Instructor Removed",
          description: `${instructorName} has been removed from the class.`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to remove instructor",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to remove instructor",
        variant: "destructive",
      });
    }
  };

  // Remove individual course from batch
  const handleRemoveBatchCourse = async (relationId: number, courseName: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/relations/batch-course/${relationId}`,
        { 
          method: "DELETE",
          headers: getAuthHeaders()
        }
      );
      
      if (res.ok) {
        setBatchCourseRelations(
          batchCourseRelations.filter((r) => r.id !== relationId)
        );
        toast({
          title: "Course Removed",
          description: `${courseName} has been removed from the batch.`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to remove course",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to remove course",
        variant: "destructive",
      });
    }
  };

  // Remove individual course from instructor
  const handleRemoveInstructorCourse = async (relationId: number, courseName: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/relations/instructor-course/${relationId}`,
        { 
          method: "DELETE",
          headers: getAuthHeaders()
        }
      );
      
      if (res.ok) {
        setInstructorCourseRelations(
          instructorCourseRelations.filter((r) => r.id !== relationId)
        );
        toast({
          title: "Course Removed",
          description: `${courseName} has been removed from the instructor.`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to remove course",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to remove course",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBatchCourse = async (id: number) => {
    const res = await fetch(
      `${API_BASE_URL}/api/relations/batch-course/${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setBatchCourseRelations(batchCourseRelations.filter((r) => r.id !== id));
      toast({
        title: "Relation Removed",
        description: "The batch-course assignment has been removed.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to remove relation",
        variant: "destructive",
      });
    }
  };

  const handleDeleteInstructorCourse = async (id: number) => {
    const res = await fetch(
      `${API_BASE_URL}/api/relations/instructor-course/${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setInstructorCourseRelations(
        instructorCourseRelations.filter((r) => r.id !== id)
      );
      toast({
        title: "Relation Removed",
        description: "The instructor-course assignment has been removed.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to remove relation",
        variant: "destructive",
      });
    }
  };

  // Delete all relations for a grouped entity
  const handleDeleteGroupedRelations = async (
    relationType: string,
    relationIds: number[],
    entityName: string
  ) => {
    console.log('Deleting relations:', { relationType, relationIds, entityName });
    
    const deletePromises = relationIds.map(async (id) => {
      const res = await fetch(
        `${API_BASE_URL}/api/relations/${relationType}/${id}`,
        { 
          method: "DELETE",
          headers: getAuthHeaders()
        }
      );
      return res.ok;
    });

    const results = await Promise.all(deletePromises);
    const allSuccess = results.every((success) => success);

    if (allSuccess) {
      // Update the state by removing all deleted relations
      switch (relationType) {
        case "class-instructor":
          setClassInstructorRelations(
            classInstructorRelations.filter((r) => !relationIds.includes(r.id))
          );
          break;
        case "batch-course":
          setBatchCourseRelations(
            batchCourseRelations.filter((r) => !relationIds.includes(r.id))
          );
          break;
        case "instructor-course":
          setInstructorCourseRelations(
            instructorCourseRelations.filter((r) => !relationIds.includes(r.id))
          );
          break;
      }

      toast({
        title: "Relations Removed",
        description: `All assignments for ${entityName} have been removed.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to remove some relations",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Manage Relations
          </h2>
          <p className="text-muted-foreground">
            Assign relationships between different entities in the system
          </p>
        </div>

        <Tabs defaultValue="class-instructor">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="class-instructor">
              Class - Instructor
            </TabsTrigger>
            <TabsTrigger value="batch-course">Batch - Course</TabsTrigger>
            <TabsTrigger value="instructor-course">
              Instructor - Course
            </TabsTrigger>
          </TabsList>

          {/* Class - Instructor Tab */}
          <TabsContent value="class-instructor">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Class - Instructor Assignments</CardTitle>
                    <CardDescription>
                      Assign instructors to classes (multiple instructors per
                      class)
                    </CardDescription>
                  </div>
                  {!editMode && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" /> Add Assignment
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Assign Instructor to Class</DialogTitle>
                          <DialogDescription>
                            Select a class and instructor to create an
                            assignment
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="class">Class</Label>
                            <Select
                              value={classInstructorForm.class}
                              onValueChange={(value) =>
                                handleSelectChange(
                                  "classInstructor",
                                  "class",
                                  value
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a class" />
                              </SelectTrigger>
                              <SelectContent>
                                {(editMode === "classInstructor" && selectedRelation
                                  ? classes.filter(c => String(c.id) === String(selectedRelation.id))
                                  : classes
                                ).map((cls) => (
                                  <SelectItem
                                    key={cls.id}
                                    value={String(cls.id)}
                                  >
                                    {cls.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="instructor">Instructor</Label>
                            <Select
                              value={classInstructorForm.instructor}
                              onValueChange={(value) =>
                                handleSelectChange(
                                  "classInstructor",
                                  "instructor",
                                  value
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select an instructor" />
                              </SelectTrigger>
                              <SelectContent>
                                {instructors.map((instructor) => (
                                  <SelectItem
                                    key={instructor.id}
                                    value={String(instructor.id)}
                                  >
                                    {instructor.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={async (e) => {
                            e.preventDefault();
                            console.log('Dialog submit - Current form state:', classInstructorForm);
                            await handleAddClassInstructor();
                          }}>
                            Save Assignment
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}

                  {editMode === "classInstructor" && (
                    <div className="flex space-x-2">
                      <Button onClick={handleAddClassInstructor}>
                        Add New Assignment
                      </Button>
                      <Button variant="outline" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editMode === "classInstructor" && (
                  <Card className="mb-4 border-2 border-primary">
                    <CardHeader className="bg-muted">
                      <CardTitle className="text-sm">
                        Add Assignment to {selectedRelation?.class}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="instructor">Instructor</Label>
                          <Select
                            value={classInstructorForm.instructor}
                            onValueChange={(value) =>
                              handleSelectChange(
                                "classInstructor",
                                "instructor",
                                value
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select an instructor" />
                            </SelectTrigger>
                            <SelectContent>
                              {instructors.map((instructor) => (
                                <SelectItem
                                  key={instructor.id}
                                  value={String(instructor.id)}
                                >
                                  {instructor.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Instructors</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(groupedClassInstructorRelations).length ===
                      0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center">
                          No assignments found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      Object.values(groupedClassInstructorRelations).map(
                        (group: GroupedClassInstructorRelation) => (
                          <TableRow
                            key={group.id}
                            className={
                              selectedRelation?.id === group.id
                                ? "bg-muted/50"
                                : ""
                            }
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {group.class}
                                </span>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  {group.instructors.length} instructor
                                  {group.instructors.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {group.instructors.map((instructor, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                  >
                                    {instructor.name}
                                    <button
                                      onClick={() => handleRemoveInstructor(instructor.relationId, instructor.name)}
                                      className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                                      title={`Remove ${instructor.name}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end space-x-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleEditRelation("classInstructor", group)
                                  }
                                  disabled={!!editMode}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleDeleteGroupedRelations(
                                      "class-instructor",
                                      group.relationIds,
                                      group.class
                                    )
                                  }
                                  disabled={!!editMode}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      )
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Batch - Course Tab */}
          <TabsContent value="batch-course">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Batch - Course Assignments</CardTitle>
                    <CardDescription>
                      Assign courses to batches (multiple courses per batch)
                    </CardDescription>
                  </div>
                  {!editMode && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" /> Add Assignment
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Assign Course to Batch</DialogTitle>
                          <DialogDescription>
                            Select a batch and course to create an assignment
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="batch">Batch</Label>
                            <Select
                              value={batchCourseForm.batch}
                              onValueChange={(value) =>
                                handleSelectChange(
                                  "batchCourse",
                                  "batch",
                                  value
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a batch" />
                              </SelectTrigger>
                              <SelectContent>
                                {batches.map((batch) => (
                                  <SelectItem
                                    key={batch.id}
                                    value={String(batch.id)}
                                  >
                                    {batch.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="course">Course</Label>
                            <Select
                              value={batchCourseForm.course}
                              onValueChange={(value) =>
                                handleSelectChange(
                                  "batchCourse",
                                  "course",
                                  value
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a course" />
                              </SelectTrigger>
                              <SelectContent>
                                {courses.map((course) => (
                                  <SelectItem
                                    key={course.id}
                                    value={String(course.id)}
                                  >
                                    {course.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleAddBatchCourse}>
                            Save Assignment
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}

                  {editMode === "batchCourse" && (
                    <div className="flex space-x-2">
                      <Button onClick={handleAddBatchCourse}>
                        Add New Assignment
                      </Button>
                      <Button variant="outline" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editMode === "batchCourse" && (
                  <Card className="mb-4 border-2 border-primary">
                    <CardHeader className="bg-muted">
                      <CardTitle className="text-sm">
                        Add Assignment to {selectedRelation?.batch}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="course">Course</Label>
                          <Select
                            value={batchCourseForm.course}
                            onValueChange={(value) =>
                              handleSelectChange("batchCourse", "course", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a course" />
                            </SelectTrigger>
                            <SelectContent>
                              {courses.map((course) => (
                                <SelectItem
                                  key={course.id}
                                  value={String(course.id)}
                                >
                                  {course.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Courses</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(groupedBatchCourseRelations).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center">
                          No assignments found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      Object.values(groupedBatchCourseRelations).map(
                        (group: GroupedBatchCourseRelation) => (
                          <TableRow
                            key={group.id}
                            className={
                              selectedRelation?.id === group.id
                                ? "bg-muted/50"
                                : ""
                            }
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {group.batch}
                                </span>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  {group.courses.length} course
                                  {group.courses.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {group.courses.map((course, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                  >
                                    {course.name}
                                    <button
                                      onClick={() => handleRemoveBatchCourse(course.relationId, course.name)}
                                      className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                                      title={`Remove ${course.name}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end space-x-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleEditRelation("batchCourse", group)
                                  }
                                  disabled={!!editMode}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleDeleteGroupedRelations(
                                      "batch-course",
                                      group.relationIds,
                                      group.batch
                                    )
                                  }
                                  disabled={!!editMode}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      )
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Instructor - Course Tab */}
          <TabsContent value="instructor-course">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Instructor - Course Assignments</CardTitle>
                    <CardDescription>
                      Assign courses to instructors (multiple courses per
                      instructor)
                    </CardDescription>
                  </div>
                  {!editMode && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" /> Add Assignment
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Assign Course to Instructor</DialogTitle>
                          <DialogDescription>
                            Select an instructor and course to create an
                            assignment
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="instructor">Instructor</Label>
                            <Select
                              value={instructorCourseForm.instructor}
                              onValueChange={(value) =>
                                handleSelectChange(
                                  "instructorCourse",
                                  "instructor",
                                  value
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select an instructor" />
                              </SelectTrigger>
                              <SelectContent>
                                {instructors.map((instructor) => (
                                  <SelectItem
                                    key={instructor.id}
                                    value={String(instructor.id)}
                                  >
                                    {instructor.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="course">Course</Label>
                            <Select
                              value={instructorCourseForm.course}
                              onValueChange={(value) =>
                                handleSelectChange(
                                  "instructorCourse",
                                  "course",
                                  value
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a course" />
                              </SelectTrigger>
                              <SelectContent>
                                {courses.map((course) => (
                                  <SelectItem
                                    key={course.id}
                                    value={String(course.id)}
                                  >
                                    {course.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleAddInstructorCourse}>
                            Save Assignment
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}

                  {editMode === "instructorCourse" && (
                    <div className="flex space-x-2">
                      <Button onClick={handleAddInstructorCourse}>
                        Add New Assignment
                      </Button>
                      <Button variant="outline" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editMode === "instructorCourse" && (
                  <Card className="mb-4 border-2 border-primary">
                    <CardHeader className="bg-muted">
                      <CardTitle className="text-sm">
                        Add Assignment to {selectedRelation?.instructor}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="course">Course</Label>
                          <Select
                            value={instructorCourseForm.course}
                            onValueChange={(value) =>
                              handleSelectChange(
                                "instructorCourse",
                                "course",
                                value
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a course" />
                            </SelectTrigger>
                            <SelectContent>
                              {courses.map((course) => (
                                <SelectItem
                                  key={course.id}
                                  value={String(course.id)}
                                >
                                  {course.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instructor</TableHead>
                      <TableHead>Courses</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(groupedInstructorCourseRelations).length ===
                      0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center">
                          No assignments found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      Object.values(groupedInstructorCourseRelations).map(
                        (group: GroupedInstructorCourseRelation) => (
                          <TableRow
                            key={group.id}
                            className={
                              selectedRelation?.id === group.id
                                ? "bg-muted/50"
                                : ""
                            }
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {group.instructor}
                                </span>
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  {group.courses.length} course
                                  {group.courses.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {group.courses.map((course, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                  >
                                    {course.name}
                                    <button
                                      onClick={() => handleRemoveInstructorCourse(course.relationId, course.name)}
                                      className="ml-1 hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                                      title={`Remove ${course.name}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end space-x-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleEditRelation(
                                      "instructorCourse",
                                      group
                                    )
                                  }
                                  disabled={!!editMode}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleDeleteGroupedRelations(
                                      "instructor-course",
                                      group.relationIds,
                                      group.instructor
                                    )
                                  }
                                  disabled={!!editMode}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      )
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

    </DashboardLayout>
  );
};

export default RelationsPage;
