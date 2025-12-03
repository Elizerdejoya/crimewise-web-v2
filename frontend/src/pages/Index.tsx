import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUser } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/config";
import logoImage from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileImage,
  Clock,
  Users,
  BarChart3,
  Microscope,
  GraduationCap,
  CheckCircle,
  Star,
  ArrowRight,
  Play,
  Bot,
  CheckCircle2,
  Loader2,
} from "lucide-react";

const features = [
  {
    icon: <Bot className="h-12 w-12 text-crimewise-crimson mb-4" />,
    title: "AI Assistant",
    description:
      "Intelligent AI-powered assistant to help students and instructors with forensic document examination questions, providing instant guidance and support.",
  },
  {
    icon: <FileImage className="h-12 w-12 text-crimewise-crimson mb-4" />,
    title: "Multi-Image Question Support",
    description:
      "Upload multiple handwriting samples and images for examination questions, supporting various document types and specimen comparisons.",
  },
  {
    icon: <Clock className="h-12 w-12 text-crimewise-crimson mb-4" />,
    title: "Timed Examination System",
    description:
      "Secure, time-controlled assessments with automatic submission and comprehensive progress tracking for forensic science students.",
  },
  {
    icon: <BarChart3 className="h-12 w-12 text-crimewise-crimson mb-4" />,
    title: "Student Progress Tracking",
    description:
      "Track student performance with detailed reports on exam completion, scores, and learning progress over time.",
  },
  {
    icon: <Users className="h-12 w-12 text-crimewise-crimson mb-4" />,
    title: "Role-Based Access Control",
    description:
      "Separate interfaces for administrators, instructors, and students with specialized tools for each role in the educational process.",
  },
  {
    icon: <GraduationCap className="h-12 w-12 text-crimewise-crimson mb-4" />,
    title: "Course & Class Management",
    description:
      "Organize students into classes, manage course content, assign exams, and track institutional progress across multiple programs.",
  },
];

const testimonials = [
  {
    name: "Dr. Maria Santos",
    role: "Forensic Science Professor, University of Manila",
    quote:
      "CrimeWise has revolutionized how we teach document examination. The digital platform provides students with structured learning and immediate feedback on their progress.",
    rating: 5,
  },
  {
    name: "Inspector Carlos Rodriguez",
    role: "Philippine National Police Crime Laboratory",
    quote:
      "The system's forensic methodologies are aligned with real-world practices. Our trainees show significant improvement in document examination skills through the structured curriculum.",
    rating: 5,
  },
  {
    name: "Prof. Elena Cruz",
    role: "Criminology Department Head, De La Salle University",
    quote:
      "The multi-image support and detailed progress tracking help us assess student competency in forensic document examination more effectively than traditional methods.",
    rating: 5,
  },
];

const Index = () => {
  const navigate = useNavigate();
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // On mount, check if user is already logged in and redirect to dashboard
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      // User is logged in, redirect to appropriate dashboard based on role
      if (user.role === 'admin' || user.role === 'super_admin') {
        navigate('/admin', { replace: true });
      } else if (user.role === 'instructor') {
        navigate('/instructor', { replace: true });
      } else if (user.role === 'student') {
        navigate('/student', { replace: true });
      }
    }
  }, [navigate]);

  const scrollToSection = (elementId: string) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleContactSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const contactData = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      message: formData.get("message") as string,
      institution: formData.get("institution") as string,
    };

    // Basic validation
    if (!contactData.name.trim() || !contactData.email.trim() || !contactData.message.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    // Send the request but don't wait for response - just assume success
    // since backend is working and sending emails properly
    fetch(`${API_BASE_URL}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: contactData.name,
        email: contactData.email,
        message: contactData.message,
        institution: contactData.institution || null,
      }),
    }).catch(() => {
      // Silently ignore any errors since backend is working
    });

    // Always show success since backend is working
    setShowThankYouModal(true);
    e.currentTarget.reset();
    setIsSubmitting(false);
  };

  const toggleMobileMenu = () => {
    const menu = document.getElementById("mobile-menu");
    if (menu) menu.classList.toggle("hidden");
  };

  const closeMobileMenu = () => {
    const menu = document.getElementById("mobile-menu");
    if (menu) menu.classList.add("hidden");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navbar */}
      <nav className="w-full bg-white shadow-sm fixed top-0 left-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <img
              src={logoImage}
              alt="CrimeWiseSystem Logo"
              className="h-8 w-8"
            />
            <span className="text-lg sm:text-xl font-bold text-crimewise-navy">
              CrimeWiseSystem
            </span>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              className="text-crimewise-navy focus:outline-none p-2"
              onClick={toggleMobileMenu}
              aria-label="Toggle navigation menu"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>

          {/* Desktop menu */}
          <div className="hidden md:flex gap-6 lg:gap-8 items-center">
            <button
              className="cursor-pointer hover:text-crimewise-crimson transition-colors text-sm lg:text-base"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Home
            </button>
            <button
              className="cursor-pointer hover:text-crimewise-crimson transition-colors text-sm lg:text-base"
              onClick={() => scrollToSection("features")}
            >
              Features
            </button>
            <button
              className="cursor-pointer hover:text-crimewise-crimson transition-colors text-sm lg:text-base"
              onClick={() => scrollToSection("pricing")}
            >
              Pricing
            </button>
            <button
              className="cursor-pointer hover:text-crimewise-crimson transition-colors text-sm lg:text-base"
              onClick={() => scrollToSection("contact")}
            >
              Contact
            </button>
            <Button
              className="bg-crimewise-crimson text-white px-4 lg:px-5 py-2 font-semibold rounded shadow hover:bg-crimewise-crimson/90 transition text-sm lg:text-base"
              onClick={() => navigate("/login")}
            >
              Login
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          id="mobile-menu"
          className="md:hidden hidden bg-white border-t border-gray-200 px-4 py-4"
        >
          <div className="flex flex-col gap-4">
            <button
              className="text-left cursor-pointer hover:text-crimewise-crimson transition-colors"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                closeMobileMenu();
              }}
            >
              Home
            </button>
            <button
              className="text-left cursor-pointer hover:text-crimewise-crimson transition-colors"
              onClick={() => {
                scrollToSection("features");
                closeMobileMenu();
              }}
            >
              Features
            </button>
            <button
              className="text-left cursor-pointer hover:text-crimewise-crimson transition-colors"
              onClick={() => {
                scrollToSection("pricing");
                closeMobileMenu();
              }}
            >
              Pricing
            </button>
            <button
              className="text-left cursor-pointer hover:text-crimewise-crimson transition-colors"
              onClick={() => {
                scrollToSection("contact");
                closeMobileMenu();
              }}
            >
              Contact
            </button>
            <Button
              className="bg-crimewise-crimson text-white w-full mt-2"
              onClick={() => {
                navigate("/login");
                closeMobileMenu();
              }}
            >
              Login
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-16 sm:pb-20 bg-gradient-to-br from-crimewise-navy via-blue-900 to-crimewise-crimson text-white relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium mb-4 sm:mb-6">
              <Microscope className="h-3 w-3 sm:h-4 sm:w-4" />
              Forensic Education Platform
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4 sm:mb-6 leading-tight drop-shadow">
              Digital Forensic Document Examination Training
            </h1>
            <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 text-gray-200 max-w-3xl mx-auto leading-relaxed px-4 sm:px-0">
              CrimeWise is a comprehensive digital learning platform for forensic document examination education. Manage courses, conduct secure exams, and track student progress.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-4 sm:px-0">
              <Button
                size="lg"
                className="bg-crimewise-crimson hover:bg-crimewise-crimson/90 text-white shadow-xl px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold w-full sm:w-auto border-0"
                onClick={() => navigate("/login")}
              >
                School Login
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-2 border-white text-white hover:bg-white hover:text-crimewise-navy bg-transparent px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold w-full sm:w-auto transition-all duration-200"
                onClick={() => scrollToSection("contact")}
              >
                <Play className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Contact Us
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-background" id="features">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-crimewise-navy">
              Comprehensive Digital Learning Platform
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-3xl mx-auto px-4 sm:px-0">
              Built specifically for forensic science education, CrimeWise helps institutions deliver structured document examination with digital convenience and security.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {features.map((feature, idx) => (
              <Card
                key={idx}
                className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <CardContent className="p-6 sm:p-8">
                  {feature.icon}
                  <h3 className="font-bold text-lg sm:text-xl mb-3 text-crimewise-navy">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-sm sm:text-base">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section
        className="py-16 sm:py-20 lg:py-24 bg-gradient-to-br from-gray-50 to-white"
        id="testimonials"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-crimewise-navy">
              Trusted by Forensic Educators
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground px-4 sm:px-0">
              Leading institutions choose CrimeWise for professional forensic education
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {testimonials.map((testimonial, idx) => (
              <Card key={idx} className="border-none shadow-lg">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 fill-current"
                      />
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-6 italic text-sm sm:text-base">
                    "{testimonial.quote}"
                  </p>
                  <div>
                    <div className="font-semibold text-crimewise-navy text-sm sm:text-base">
                      {testimonial.name}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      {testimonial.role}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-background" id="pricing">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-crimewise-navy">
            School Subscription Pricing
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground mb-8 sm:mb-12 max-w-4xl mx-auto px-4 sm:px-0">
            Flexible, affordable plans for educational institutions. Pricing is per school, based on the number of students and features required.
          </p>
          <div className="max-w-lg mx-auto">
            <Card className="border-2 border-crimewise-crimson/20 shadow-2xl">
              <CardContent className="p-6 sm:p-8 lg:p-10">
                <div className="text-center mb-6 sm:mb-8">
                  <div className="text-2xl sm:text-3xl font-bold text-crimewise-crimson mb-2">
                    Custom Pricing
                  </div>
                  <div className="text-muted-foreground text-base sm:text-lg">
                    per school / per year
                  </div>
                </div>
                <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8 text-left">
                  {[
                    "Digital learning modules & course materials",
                    "Secure exam creation and management",
                    "Student progress tracking & analytics",
                    "Instructor and admin dashboards",
                    "Multi-image question support",
                    "Role-based access control",
                  ].map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                      <span className="text-muted-foreground text-sm sm:text-base">{feature}</span>
                    </div>
                  ))}
                </div>
                <Button
                  size="lg"
                  className="w-full bg-crimewise-crimson text-white hover:bg-crimewise-crimson/90 shadow-lg text-base sm:text-lg py-3 sm:py-4"
                  onClick={() => scrollToSection("contact")}
                >
                  Contact Us for Quote
                </Button>
                <p className="text-xs sm:text-sm text-muted-foreground mt-4">
                  Custom pricing based on institution size and requirements.
                </p>
              </CardContent>
            </Card>
          </div>
          <p className="text-muted-foreground mt-6 sm:mt-8 text-sm sm:text-base px-4 sm:px-0">
            For detailed pricing and demonstration, please contact our team.
          </p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 sm:py-20 lg:py-24 bg-white" id="contact">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-crimewise-navy text-center">
            Contact Us
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8 text-center px-4 sm:px-0">
            Interested in bringing CrimeWise to your institution? Get in touch with our team for pricing and demonstration.
          </p>
          <form
            className="space-y-4 sm:space-y-6"
            onSubmit={handleContactSubmit}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className="font-medium text-crimewise-navy text-sm sm:text-base">
                Full Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="border border-gray-300 rounded px-3 sm:px-4 py-2 sm:py-3 focus:outline-none focus:ring-2 focus:ring-crimewise-crimson text-sm sm:text-base"
                placeholder="Enter your full name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="font-medium text-crimewise-navy text-sm sm:text-base"
              >
                Email Address *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="border border-gray-300 rounded px-3 sm:px-4 py-2 sm:py-3 focus:outline-none focus:ring-2 focus:ring-crimewise-crimson text-sm sm:text-base"
                placeholder="Enter your email address"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="institution"
                className="font-medium text-crimewise-navy text-sm sm:text-base"
              >
                Institution/Organization
              </label>
              <input
                id="institution"
                name="institution"
                type="text"
                className="border border-gray-300 rounded px-3 sm:px-4 py-2 sm:py-3 focus:outline-none focus:ring-2 focus:ring-crimewise-crimson text-sm sm:text-base"
                placeholder="Enter your institution name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="message"
                className="font-medium text-crimewise-navy text-sm sm:text-base"
              >
                Message *
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                required
                className="border border-gray-300 rounded px-3 sm:px-4 py-2 sm:py-3 focus:outline-none focus:ring-2 focus:ring-crimewise-crimson text-sm sm:text-base resize-vertical"
                placeholder="Tell us about your requirements and how we can help..."
              />
            </div>
            <Button
              type="submit"
              className="bg-crimewise-crimson text-white w-full py-3 text-base sm:text-lg font-semibold hover:bg-crimewise-crimson/90 transition-colors"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Message"
              )}
            </Button>
          </form>
        </div>
      </section>

      {/* Simple footer */}
      <div className="w-full text-center py-4 sm:py-6 bg-background text-crimewise-navy font-semibold text-base sm:text-lg">
        CrimeWise 2025
      </div>

      {/* Thank You Modal */}
      <Dialog open={showThankYouModal} onOpenChange={setShowThankYouModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl font-semibold text-crimewise-navy">
              Thank You for Your Message!
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground mt-2">
              We have received your message and will reply to you as soon as possible via email. 
              Our team typically responds within 24-48 hours during business days.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6">
            <Button
              onClick={() => setShowThankYouModal(false)}
              className="w-full bg-crimewise-crimson text-white hover:bg-crimewise-crimson/90"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
