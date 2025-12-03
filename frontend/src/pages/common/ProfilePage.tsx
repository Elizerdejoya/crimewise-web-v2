import { useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/config";
import { User, Eye, EyeOff } from "lucide-react";

interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  batch_id?: number;
  class_id?: number;
  batch_name?: string;
  class_name?: string;
}

interface ProfilePageProps {
  userRole?: string; // Optional prop to override the detected role
}

// Custom Password Input Component with View/Hide Toggle
const PasswordInput = ({ 
  id, 
  label, 
  value, 
  onChange, 
  showPassword, 
  onToggleVisibility 
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showPassword: boolean;
  onToggleVisibility: () => void;
}) => {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={onChange}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
};

const ProfilePage = ({ userRole }: ProfilePageProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<UserProfile>>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changePasswordMode, setChangePasswordMode] = useState(false);

  const { toast } = useToast();

  // Get user details from JWT token
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("No authentication token found");
      setLoading(false);
      return;
    }

    try {
      // Use try-catch to handle potential parsing errors
      let decoded;
      try {
        decoded = jwtDecode(token);
      } catch (err) {
        console.error("Failed to decode token:", err);
        setError("Invalid authentication token");
        setLoading(false);
        return;
      }

      const userId = decoded.id;
      const role = userRole || decoded.role;

      // Fetch user profile data
      fetch(`${API_BASE_URL}/api/users/${userId}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch profile data");
          return res.json();
        })
        .then((data) => {
          setProfile(data);
          setEditedProfile(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Profile fetch error:", err);
          setError(err.message || "Failed to fetch profile data");
          setLoading(false);
        });

      // If student or instructor, fetch additional information
      if (role === "student") {
        // Fetch student's batch and class info from the full endpoint
        fetch(`${API_BASE_URL}/api/students/full`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => {
            if (!res.ok) return null;
            return res.json();
          })
          .then((data) => {
            if (Array.isArray(data)) {
              // Find the student record that matches userId by any possible ID field
              const student = data.find((s: any) => {
                const candidates = [s.student_id, s.studentId, s.id, s.user_id, s.userId];
                return candidates.map((c) => (c !== undefined && c !== null ? String(c) : null)).includes(String(userId));
              });
              
              if (student) {
                console.log('Found student record:', student);
                const normalized = {
                  batch_name: student.batch_name ?? student.batch ?? student.batchName ?? "-",
                  batch: student.batch_name ?? student.batch ?? student.batchName ?? "-",
                  class_name: student.class_name ?? student.class ?? student.className ?? "-",
                  class: student.class_name ?? student.class ?? student.className ?? "-",
                };
                console.log('Normalized batch/class:', normalized);
                setProfile((prev) => (prev ? { ...prev, ...normalized } : null));
                setEditedProfile((prev) => ({ ...prev, ...normalized }));
              } else {
                console.log('No student found matching userId:', userId);
                console.log('Available student IDs:', data.map((s: any) => ({ 
                  student_id: s.student_id, 
                  studentId: s.studentId, 
                  id: s.id, 
                  user_id: s.user_id, 
                  userId: s.userId 
                })));
              }
            }
          })
          .catch((err) => console.error("Error fetching student batch/class info:", err));
      } else if (role === "instructor") {
        // Fetch instructor info if needed
        fetch(`${API_BASE_URL}/api/instructors/${userId}`)
          .then((res) => {
            if (res.ok) return res.json();
            return null;
          })
          .then((data) => {
            if (data) {
              setProfile((prev) => (prev ? { ...prev, ...data } : null));
              setEditedProfile((prev) => ({ ...prev, ...data }));
            }
          })
          .catch((err) => console.error("Error fetching instructor info:", err));
      }
    } catch (err) {
      setError("Failed to decode token");
      setLoading(false);
    }
  }, [userRole]);

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel edit
      setEditedProfile(profile || {});
    }
    setIsEditing(!isEditing);
    setChangePasswordMode(false);
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditedProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordModeToggle = () => {
    setChangePasswordMode(!changePasswordMode);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleProfileUpdate = async () => {
    if (!profile) return;

    // Validate required fields
    if (!editedProfile.name || !editedProfile.email) {
      toast({
        title: "Validation Error",
        description: "Name and email are required.",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editedProfile.email)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    try {
      const userId = profile.id;
      const endpoint = `${API_BASE_URL}/api/users/${userId}`;

      const payload: any = {
        name: editedProfile.name.trim(),
        email: editedProfile.email.trim().toLowerCase(),
        // Don't send role and status for self-updates - backend will preserve them
      };

      console.log('Updating profile:', payload);
      console.log('Endpoint:', endpoint);

      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(payload),
      });

      console.log('Response status:', res.status);

      if (res.ok) {
        const updatedProfile = await res.json();
        setProfile((prevProfile) => ({ ...prevProfile!, ...updatedProfile }));
        setEditedProfile(updatedProfile); // Update edited profile to match
        setIsEditing(false);
        toast({
          title: "Profile Updated",
          description: "Your profile has been updated successfully.",
        });
      } else {
        const error = await res.json().catch(() => ({}));
        console.log('Update error:', error);
        toast({
          title: "Update Failed",
          description: error.error || `Failed to update profile. Status: ${res.status}`,
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error('Profile update error:', err);
      toast({
        title: "Update Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || !confirmPassword || !currentPassword) {
      toast({
        title: "Validation Error",
        description: "All password fields are required.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Validation Error",
        description: "New password and confirmation do not match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Validation Error",
        description: "New password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    try {
      const userId = profile?.id;
      const endpoint = `${API_BASE_URL}/api/users/${userId}/password`;

      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (res.ok) {
        setChangePasswordMode(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        toast({
          title: "Password Updated",
          description: "Your password has been changed successfully.",
        });
      } else {
        const error = await res.json().catch(() => ({}));
        toast({
          title: "Password Change Failed",
          description: error.error || "Failed to change password.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error('Password update error:', err);
      toast({
        title: "Password Change Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2">Loading profile...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Your Profile</h2>
          <p className="text-muted-foreground">
            View and manage your profile information
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Your personal information</CardDescription>
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={handleEditToggle}>
                        Cancel
                      </Button>
                      <Button onClick={handleProfileUpdate}>
                        Save Changes
                      </Button>
                    </>
                  ) : (
                    <Button onClick={handleEditToggle}>Edit Profile</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="mx-auto bg-muted rounded-full h-24 w-24 flex items-center justify-center mb-4">
                <User className="h-12 w-12 text-muted-foreground" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      name="name"
                      value={editedProfile.name || ""}
                      onChange={handleProfileChange}
                    />
                  ) : (
                    <div className="py-2 px-3 border rounded-md bg-muted/50">
                      {profile?.name}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  {isEditing ? (
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={editedProfile.email || ""}
                      onChange={handleProfileChange}
                    />
                  ) : (
                    <div className="py-2 px-3 border rounded-md bg-muted/50">
                      {profile?.email}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="py-2 px-3 border rounded-md bg-muted/50 capitalize">
                    {profile?.role}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <div
                    className={`py-2 px-3 rounded-md flex items-center gap-2 
                    ${
                      profile?.status === "active"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        profile?.status === "active"
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    ></div>
                    <span className="capitalize">{profile?.status}</span>
                  </div>
                </div>

                {/* Show batch and class info for students */}
                {profile?.role === "student" && (
                  <>
                    <div className="space-y-2">
                      <Label>Batch</Label>
                      <div className="py-2 px-3 border rounded-md bg-muted/50">
                        {profile.batch_name || "Not assigned"}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Class</Label>
                      <div className="py-2 px-3 border rounded-md bg-muted/50">
                        {profile.class_name || "Not assigned"}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Security Settings</CardTitle>
                  <CardDescription>Manage your password</CardDescription>
                </div>
                <div className="flex gap-2">
                  {changePasswordMode ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={handlePasswordModeToggle}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handlePasswordChange}>
                        Change Password
                      </Button>
                    </>
                  ) : (
                    <Button onClick={handlePasswordModeToggle}>
                      Change Password
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {changePasswordMode ? (
                <div className="space-y-4">
                  <PasswordInput
                    id="current-password"
                    label="Current Password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    showPassword={showCurrentPassword}
                    onToggleVisibility={() => setShowCurrentPassword(!showCurrentPassword)}
                  />

                  <Separator className="my-4" />

                  <PasswordInput
                    id="new-password"
                    label="New Password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    showPassword={showNewPassword}
                    onToggleVisibility={() => setShowNewPassword(!showNewPassword)}
                  />

                  <PasswordInput
                    id="confirm-password"
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    showPassword={showConfirmPassword}
                    onToggleVisibility={() => setShowConfirmPassword(!showConfirmPassword)}
                  />
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Your password is confidential. Click "Change Password" to
                  update it.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
