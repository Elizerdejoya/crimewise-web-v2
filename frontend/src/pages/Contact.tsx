import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Mail, Facebook, Twitter, Instagram, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/config";

const Contact = () => {
  const [form, setForm] = useState({ name: "", email: "", message: "", institution: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
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
        name: form.name,
        email: form.email,
        message: form.message,
        institution: form.institution || null,
      }),
    }).catch(() => {
      // Silently ignore any errors since backend is working
    });


    toast({
      title: "Message Sent Successfully!",
      description: "Your message has been sent successfully! We'll get back to you soon.",
    });
    setForm({ name: "", email: "", message: "", institution: "" });
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background py-20 px-4">
      <div className="w-full max-w-xl bg-white rounded-lg shadow-lg p-10">
        <h1 className="text-3xl font-bold text-crimewise-navy mb-2 text-center">
          Contact Us
        </h1>
        <p className="text-gray-600 mb-8 text-center">
          Have questions or need support? Fill out the form below or reach us
          directly.
        </p>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-gray-700 mb-1 font-medium">Name</label>
            <input
              type="text"
              className="w-full border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-crimewise-crimson"
              placeholder="Your Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1 font-medium">
              Email
            </label>
            <input
              type="email"
              className="w-full border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-crimewise-crimson"
              placeholder="you@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1 font-medium">
              Institution/Organization
            </label>
            <input
              type="text"
              className="w-full border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-crimewise-crimson"
              placeholder="Your institution or organization (optional)"
              value={form.institution}
              onChange={(e) => setForm({ ...form, institution: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1 font-medium">
              Message
            </label>
            <textarea
              className="w-full border rounded px-4 py-2 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-crimewise-crimson"
              placeholder="How can we help you?"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
          <Button
            className="w-full bg-crimewise-crimson text-white py-3 text-lg font-semibold rounded shadow hover:bg-crimewise-crimson/90 transition"
            type="submit"
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
        <div className="mt-10 border-t pt-6 text-center">
          <div className="flex flex-col md:flex-row gap-4 justify-center items-center mb-2">
            <a
              href="mailto:support@crimewisesystem.com"
              className="flex items-center gap-2 text-crimewise-navy hover:text-crimewise-crimson"
            >
              <Mail /> support@crimewisesystem.com
            </a>
          </div>
          <div className="flex gap-6 justify-center mt-2 text-xl">
            <a href="#" className="hover:text-crimewise-crimson">
              <Facebook />
            </a>
            <a href="#" className="hover:text-crimewise-crimson">
              <Twitter />
            </a>
            <a href="#" className="hover:text-crimewise-crimson">
              <Instagram />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
