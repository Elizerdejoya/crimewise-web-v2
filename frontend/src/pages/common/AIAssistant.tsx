import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Send, Image, Bot, User, Upload, Trash2, Printer } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { jwtDecode } from "jwt-decode";
import DashboardLayout from "@/components/layout/DashboardLayout";
import topLogo from '@/assets/top-logo.png';
import bottomLogo from '@/assets/bottom-logo.png';

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  type: "text" | "image-analysis";
  imageUrl?: string;
}

interface DecodedToken {
  id: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

const AIAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Get current user from token
  const getCurrentUser = (): DecodedToken | null => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    try {
      return jwtDecode<DecodedToken>(token);
    } catch {
      return null;
    }
  };

  const currentUser = getCurrentUser();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load chat history on component mount
  useEffect(() => {
    if (currentUser?.id) {
      loadChatHistory();
    }
  }, [currentUser?.id]);

  const loadChatHistory = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/chatbot/history/${currentUser?.id}`
      );

      if (response.ok) {
        const data = await response.json();
        const formattedHistory = data.history.map(
          (msg: any, index: number) => ({
            id: `history-${index}`,
            content: msg.content,
            role: msg.role,
            timestamp: msg.timestamp || new Date().toISOString(),
            type: "text" as const,
          })
        );
        setMessages(formattedHistory);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  };

  const clearChatHistory = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/chatbot/history/${currentUser?.id}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setMessages([]);
        toast({
          title: "Chat History Cleared",
          description: "Your chat history has been cleared successfully.",
        });
      }
    } catch (error) {
      console.error("Failed to clear chat history:", error);
      toast({
        title: "Error",
        description: "Failed to clear chat history.",
        variant: "destructive",
      });
    }
  };

  // Heuristic topic filter: only allow questions related to forensic handwriting, signatures, or document examination.
  const FORENSIC_KEYWORDS = [
    "handwriting",
    "signature",
    "signatures",
    "forensic",
    "forgery",
    "forged",
    "forgery detection",
    "handwriting analysis",
    "document",
    "document examination",
    "ink",
    "pen",
    "pressure",
    "slant",
    "baseline",
    "legibility",
    "loops",
    "strokes",
    "exemplar",
    "comparison",
    "writer",
    "writer identification",
    "signature verification",
    "cursive",
    "manuscript",
    "graphology",
    "stroke",
    "pen pressure",
    "signature match",
    "initials",
    "forensic document",
    "hand",
  ];

  const isForensicRelated = (text?: string) => {
    if (!text) return false;
    const s = text.toLowerCase();
    // quick checks for keywords
    for (const k of FORENSIC_KEYWORDS) {
      if (s.includes(k)) return true;
    }
    // also allow if the input mentions 'analyze' plus 'image' or 'sample'
    if ((s.includes("analy") || s.includes("examin")) && (s.includes("image") || s.includes("sample") || s.includes("handwriting") || s.includes("signature"))) {
      return true;
    }
    return false;
  };

  const sendMessage = async (text?: string) => {
    const messageText = ((text ?? inputMessage) || "").toString();
    if (!messageText.trim() || isLoading) return;

    // If not related to forensic handwriting/signature, refuse locally
    if (!isForensicRelated(messageText)) {
      const assistantRefusal: Message = {
        id: `refuse-${Date.now()}`,
        content: "Sorry — I can only answer questions related to forensic handwriting, signatures, and forensic document examination. Please ask a question focused on those topics.",
        role: "assistant",
        timestamp: new Date().toISOString(),
        type: "text",
      };
      setMessages((prev) => [...prev, assistantRefusal]);
      return;
    }

    // Determine message type based on whether an image is selected
    const isImageMessage = selectedImage && imagePreview;
    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageText,
      role: "user",
      timestamp: new Date().toISOString(),
      type: isImageMessage ? "image-analysis" : "text",
      imageUrl: isImageMessage ? imagePreview : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      let response;

      // If an image is selected, send using FormData with image
      if (selectedImage && imagePreview) {
        const formData = new FormData();
        formData.append("image", selectedImage);
        // include the textual question so the analyzer can use it
        formData.append("message", messageText);
        formData.append("userId", currentUser?.id || "");

        // Use the same analyze endpoint the "Analyze" button uses
        response = await fetch(`${API_BASE_URL}/api/chatbot/analyze-image`, {
          method: "POST",
          body: formData,
        });
      } else {
        // Regular text message
        response = await fetch(`${API_BASE_URL}/api/chatbot/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: messageText,
            userId: currentUser?.id,
          }),
        });
      }

      if (response.ok) {
        const data = await response.json();
        // Fallback if message is blank or missing
        let aiContent = data.message;
        if (!aiContent || typeof aiContent !== "string" || !aiContent.trim()) {
          aiContent =
            "Sorry, I couldn't generate a response. Please try rephrasing your question or try again later.";
        }
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: aiContent,
          role: "assistant",
          timestamp: data.timestamp || new Date().toISOString(),
          type: isImageMessage ? "image-analysis" : "text",
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Clear image after sending
        if (selectedImage) {
          setSelectedImage(null);
          setImagePreview(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      } else {
        throw new Error("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Predefined quick prompts - 6 core forensic handwriting and signature questions
  const quickPrompts: string[] = [
    "What are the key characteristics used in forensic handwriting analysis?",
    "How can I identify signs of forgery in a signature or handwriting?",
    "What is the difference between natural variation and simulation in handwriting?",
    "Explain the role of pressure and stroke analysis in handwriting examination.",
    "What makes a handwriting sample suitable for forensic analysis?",
    "How do forensic experts compare handwriting samples for identification?"
  ];

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        // 10MB limit
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!selectedImage || isAnalyzing) return;

    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("image", selectedImage);

      console.log("Sending image for analysis:", {
        name: selectedImage.name,
        size: selectedImage.size,
        type: selectedImage.type
      });

      const response = await fetch(
        `${API_BASE_URL}/api/chatbot/analyze-image`,
        {
          method: "POST",
          body: formData,
        }
      );

      console.log("Response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Analysis received:", data);

        const userMessage: Message = {
          id: Date.now().toString(),
          content: `Analyzing handwriting image: ${selectedImage.name}`,
          role: "user",
          timestamp: new Date().toISOString(),
          type: "image-analysis",
          imageUrl: imagePreview || undefined,
        };

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.analysis,
          role: "assistant",
          timestamp: data.timestamp,
          type: "image-analysis",
        };

        setMessages((prev) => [...prev, userMessage, assistantMessage]);

        // Clear image selection
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        toast({
          title: "Analysis Complete",
          description: "Handwriting analysis completed successfully.",
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("Analysis failed:", errorData);
        throw new Error(errorData.error || "Failed to analyze image");
      }
    } catch (error) {
      console.error("Error analyzing image:", error);
      toast({
        title: "Error",
        description: `Failed to analyze image: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderMarkdownToHtml = (raw: string) => {
    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const escaped = escapeHtml(raw || "");
    // Convert **bold** to <strong>
    const bolded = escaped.replace(/\*\*(.*?)\*\*/gs, "<strong>$1</strong>");
    // Preserve line breaks
    return bolded.replace(/\n/g, "<br/>");
  };

  const handlePrintAnalysis = (message: Message) => {
    // Open a new window and write a printable report
    try {
      // Resolve logo URLs so the print window can load them
      const topLogoUrl = new URL(topLogo, window.location.href).href;
      const bottomLogoUrl = new URL(bottomLogo, window.location.href).href;
      const headerHtml = `<div style="text-align:center;margin-bottom:12px;"><img src="${topLogoUrl}" alt="Top Logo" style="width:300px;max-width:90%;height:auto;display:block;margin:0 auto;"/></div>`;
      const footerHtml = `<div style="text-align:center;margin-top:12px;"><img src="${bottomLogoUrl}" alt="Bottom Logo" style="width:200px;max-width:70%;height:auto;display:block;margin:0 auto;"/></div>`;
      const printWindow = window.open("", "_blank", "width=800,height=900");
      if (!printWindow) {
        toast({ title: "Popup blocked", description: "Please allow popups to print the report.", variant: "destructive" });
        return;
      }

      const imageHtml = message.imageUrl ? `<div style=\"margin-bottom:12px;\"><img src=\"${message.imageUrl}\" style=\"max-width:100%;height:auto;\"/></div>` : "";
      const safeContentHtml = renderMarkdownToHtml(message.content);

      const html = `
        <html>
          <head>
            <title>CrimeWise Analysis Report</title>
            <style>
              body{font-family:Arial,Helvetica,sans-serif;padding:16px;color:#111}
              .header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
              .title{font-size:18px;font-weight:700}
            </style>
          </head>
          <body>
            <div style="text-align:center;margin-bottom:12px;"><img src="${topLogoUrl}" alt="Top Logo" style="width:300px;max-width:90%;height:auto;display:block;margin:0 auto;"/></div>
            <div class="header">
              <div class="title">CrimeWise Forensic Handwriting Analysis Report</div>
              <div style="margin-left:auto;font-size:12px;color:#666">${new Date(message.timestamp).toLocaleString()}</div>
            </div>
            ${imageHtml}
            <div style="white-space:pre-wrap;">${safeContentHtml}</div>
            <div style="text-align:center;margin-top:12px;"><img src="${bottomLogoUrl}" alt="Bottom Logo" style="width:200px;max-width:70%;height:auto;display:block;margin:0 auto;"/></div>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      // Give browser a moment to render
      setTimeout(() => {
        try { printWindow.focus(); printWindow.print(); } catch (e) { /* ignore */ }
      }, 500);
    } catch (e) {
      console.error("Print failed", e);
      toast({ title: "Error", description: "Failed to open print window.", variant: "destructive" });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 h-full flex flex-col">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold">AI Assistant</h1>
                <p className="text-muted-foreground">
                  Forensic handwriting analysis assistant. Upload images for
                  detailed analysis.
                </p>
              </div>
            </div>
            <Button
              className="ml-2 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
              onClick={clearChatHistory}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear History
            </Button>
          </div>
        </div>

        <Card className="flex-1 flex flex-col min-h-0">
          <CardContent className="flex-1 flex flex-col p-0 min-h-0">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <Bot className="h-16 w-16 mx-auto mb-6 text-blue-600" />
                  <p className="text-xl font-medium mb-2">
                    Welcome to CrimeWise AI Assistant
                  </p>
                  <p className="text-base">
                    Ask questions about forensic analysis or upload handwriting
                    images for detailed examination.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                  >
                    {message.role === "assistant" && (
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                    )}

                    <div
                      className={`max-w-[70%] rounded-lg p-4 ${message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-900"
                        }`}
                    >
                      {message.type === "image-analysis" &&
                        message.imageUrl && (
                          <div className="mb-3">
                            <img
                              src={message.imageUrl}
                              alt="Handwriting sample"
                              className="max-w-full h-auto rounded border"
                              style={{ maxHeight: "200px" }}
                            />
                          </div>
                        )}
                      <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(message.content) }} />
                      <div className={`text-xs mt-2 ${message.role === "user" ? "text-blue-100" : "text-gray-500"}`}>
                        <div className="flex items-center gap-2">
                          <div>{new Date(message.timestamp).toLocaleTimeString()}</div>
                          {message.role === "assistant" && message.type === "image-analysis" && (
                            <Button
                              className="ml-2 rounded-md bg-gray-600 text-white px-2 py-1 text-sm hover:bg-gray-700"
                              onClick={() => handlePrintAnalysis(message)}
                              disabled={isLoading}
                              title="Print analysis report"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {message.role === "user" && (
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                        <User className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </div>
                ))
              )}

              {isLoading && (
                <div className="flex gap-4 justify-start">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Image Upload Area */}
            {selectedImage && (
              <div className="border-t p-4 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-4">
                  <img
                    src={imagePreview || ""}
                    alt="Preview"
                    className="w-16 h-16 object-cover rounded border"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedImage.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedImage.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={analyzeImage}
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? "Analyzing..." : "Analyze"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedImage(null);
                        setImagePreview(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="border-t p-4 flex-shrink-0">
              {selectedImage && (
                <div className="mb-3 p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs font-medium text-blue-900 mb-2">Quick questions about your image:</p>
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((p, idx) => (
                      <button
                        key={idx}
                        className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
                        onClick={() => sendMessage(p)}
                        title="Ask this question about the uploaded image"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mb-2 flex flex-wrap gap-2">
                {!selectedImage && quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    className="text-xs px-3 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                    onClick={() => setInputMessage(p)}
                    title="Click to load prompt into input"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload image for analysis"
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about forensic analysis or upload an image..."
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={!inputMessage.trim() || isLoading}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AIAssistant;
