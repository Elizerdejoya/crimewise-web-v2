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

    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageText,
      role: "user",
      timestamp: new Date().toISOString(),
      type: "text",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chatbot/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageText,
          userId: currentUser?.id,
        }),
      });

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
          type: "text",
        };
        setMessages((prev) => [...prev, assistantMessage]);
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
      <div className="w-full h-full flex items-center justify-center p-2">
        <Card className="w-full h-full max-h-[calc(100vh-120px)] flex flex-col shadow-lg border-0">
          {/* Header */}
          <CardHeader className="text-white py-4 px-6 rounded-t-lg flex-shrink-0" style={{ backgroundColor: "hsl(221, 83%, 16%)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="h-6 w-6" />
                <h2 className="text-lg font-semibold">AI Assistant</h2>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearChatHistory}
                disabled={isLoading}
                className="h-8 px-3 text-white hover:text-white"
                style={{ backgroundColor: "hsl(221, 83%, 20%)" }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden bg-white">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-0 text-sm">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <Bot className="h-14 w-14 text-blue-600" />
                  <div>
                    <p className="font-semibold text-gray-800 text-base">Ask me anything</p>
                    <p className="text-sm text-gray-500 mt-1">about forensic handwriting analysis</p>
                  </div>
                  {/* Quick Suggestions */}
                  <div className="space-y-2 w-full mt-6 text-left max-w-md">
                    {quickPrompts.slice(0, 3).map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => setInputMessage(prompt)}
                        className="w-full p-3 rounded-lg border text-sm font-medium text-left line-clamp-2 transition-colors"
                        style={{ borderColor: "hsl(221, 83%, 20%)", backgroundColor: "hsl(221, 83%, 95%)", color: "hsl(221, 83%, 16%)" }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = "hsl(221, 83%, 90%)"}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = "hsl(221, 83%, 95%)"}
                      >
                        💡 {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {message.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 text-white" style={{ backgroundColor: "hsl(221, 83%, 16%)" }}>
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-lg rounded-lg p-3 text-sm leading-relaxed ${message.role === "user"
                          ? "text-white rounded-br-none"
                          : "bg-gray-100 text-gray-900 rounded-bl-none"
                        }`}
                      style={message.role === "user" ? { backgroundColor: "hsl(221, 83%, 20%)" } : {}}
                    >
                      {message.type === "image-analysis" && message.imageUrl && (
                        <div className="mb-2">
                          <img
                            src={message.imageUrl}
                            alt="Handwriting sample"
                            className="max-w-full h-auto rounded"
                            style={{ maxHeight: "120px" }}
                          />
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(message.content) }} />
                      {message.role === "assistant" && message.type === "image-analysis" && (
                        <Button
                          className="mt-2 rounded-md px-2 py-1 text-xs text-white hover:opacity-90"
                          onClick={() => handlePrintAnalysis(message)}
                          disabled={isLoading}
                          title="Print analysis report"
                          style={{ backgroundColor: "hsl(221, 83%, 20%)" }}
                        >
                          <Printer className="h-3.5 w-3.5 mr-1" />
                          Print
                        </Button>
                      )}
                    </div>

                    {message.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-gray-400 flex items-center justify-center flex-shrink-0 mt-1">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                ))
              )}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: "hsl(221, 83%, 16%)" }}>
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-gray-100 rounded-lg p-3 flex gap-1">
                    <div className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                    <div className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Image Upload Preview */}
            {selectedImage && (
              <div className="border-t p-3 flex-shrink-0" style={{ backgroundColor: "hsl(221, 83%, 95%)" }}>
                <div className="flex items-center gap-3">
                  <img src={imagePreview || ""} alt="Preview" className="w-11 h-11 object-cover rounded border-2" style={{ borderColor: "hsl(221, 83%, 20%)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{selectedImage.name}</p>
                  </div>
                  <Button size="sm" onClick={analyzeImage} disabled={isAnalyzing} className="px-4 py-2 text-sm text-white flex-shrink-0" style={{ backgroundColor: "hsl(221, 83%, 16%)" }}>
                    {isAnalyzing ? "Analyzing..." : "Analyze"}
                  </Button>
                  <button onClick={() => { setSelectedImage(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="h-8 w-8 flex items-center justify-center hover:bg-gray-200 rounded text-gray-500 flex-shrink-0">
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="border-t bg-gray-50 p-4 flex-shrink-0">
              <div className="flex gap-3 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 w-9 p-0 flex-shrink-0 border-gray-300 hover:bg-gray-100"
                  title="Upload image"
                >
                  <Upload className="h-4.5 w-4.5 text-gray-600" />
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
                  placeholder="Type a question..."
                  className="flex-1 h-9 text-sm placeholder:text-gray-400 border-gray-300"
                  disabled={isLoading}
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={!inputMessage.trim() || isLoading}
                  size="sm"
                  className="h-9 w-9 p-0 flex-shrink-0 text-white"
                  style={{ backgroundColor: "hsl(221, 83%, 16%)" }}
                >
                  <Send className="h-4.5 w-4.5" />
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
