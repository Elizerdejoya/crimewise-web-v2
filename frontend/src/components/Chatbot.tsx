import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Send, Image, X, Bot, User, Upload, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { jwtDecode } from "jwt-decode";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  type: "text" | "image-analysis";
  imageUrl?: string;
}

interface ChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DecodedToken {
  id: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

const Chatbot: React.FC<ChatbotProps> = ({ isOpen, onClose }) => {
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
    if (isOpen && currentUser?.id) {
      loadChatHistory();
    }
  }, [isOpen, currentUser?.id]);

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

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
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
          message: inputMessage,
          userId: currentUser?.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.message,
          role: "assistant",
          timestamp: data.timestamp,
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

      const response = await fetch(
        `${API_BASE_URL}/api/chatbot/analyze-image`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();

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
        throw new Error("Failed to analyze image");
      }
    } catch (error) {
      console.error("Error analyzing image:", error);
      toast({
        title: "Error",
        description: "Failed to analyze image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl h-[85vh] max-h-[600px] flex flex-col">
        <CardHeader className="flex-shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-blue-600" />
              <CardTitle>CrimeWise AI Assistant</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearChatHistory}
                title="Clear chat history"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                title="Close chatbot"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Forensic handwriting analysis assistant. Upload images for detailed
            analysis.
          </p>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 min-h-0">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-4 text-blue-600" />
                <p className="text-lg font-medium">
                  Welcome to CrimeWise AI Assistant
                </p>
                <p className="text-sm">
                  Ask questions about forensic analysis or upload handwriting
                  images for detailed examination.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}

                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      message.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    {message.type === "image-analysis" && message.imageUrl && (
                      <div className="mb-2">
                        <img
                          src={message.imageUrl}
                          alt="Handwriting sample"
                          className="max-w-full h-auto rounded border"
                          style={{ maxHeight: "200px" }}
                        />
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    <div
                      className={`text-xs mt-1 ${
                        message.role === "user"
                          ? "text-blue-100"
                          : "text-gray-500"
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-gray-100 rounded-lg p-3">
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
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t p-4 flex-shrink-0">
            <div className="flex gap-2">
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
                onClick={sendMessage}
                disabled={!inputMessage.trim() || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Chatbot;
