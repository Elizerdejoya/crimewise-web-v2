import { API_BASE_URL } from "@/lib/config";

// Extract current user from JWT token
export function getCurrentUser() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    // Decode JWT payload
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload;
  } catch {
    return null;
  }
}

// Create auth headers
export function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Sort questions based on sort criteria and order
export function sortQuestions(
  questions: any[],
  sortBy: string | null,
  sortOrder: "asc" | "desc"
) {
  if (!sortBy) return questions;

  return [...questions].sort((a, b) => {
    if (sortBy === "id") {
      return sortOrder === "asc" ? a.id - b.id : b.id - a.id;
    } else if (sortBy === "title") {
      return sortOrder === "asc"
        ? a.title.localeCompare(b.title)
        : b.title.localeCompare(a.title);
    } else if (sortBy === "type") {
      return sortOrder === "asc"
        ? a.type.localeCompare(b.type)
        : b.type.localeCompare(a.type);
    } else if (sortBy === "course") {
      return sortOrder === "asc"
        ? a.course.localeCompare(b.course)
        : b.course.localeCompare(a.course);
    } else if (sortBy === "difficulty") {
      const difficultyOrder = { easy: 1, medium: 2, hard: 3, expert: 4 };
      const diffA =
        difficultyOrder[a.difficulty as keyof typeof difficultyOrder] || 0;
      const diffB =
        difficultyOrder[b.difficulty as keyof typeof difficultyOrder] || 0;
      return sortOrder === "asc" ? diffA - diffB : diffB - diffA;
    } else if (sortBy === "created_by") {
      const createdByA = a.created_by || "";
      const createdByB = b.created_by || "";
      return sortOrder === "asc"
        ? createdByA.localeCompare(createdByB)
        : createdByB.localeCompare(a.createdByA);
    } else if (sortBy === "created") {
      const dateA = new Date(a.created || 0);
      const dateB = new Date(b.created || 0);
      return sortOrder === "asc"
        ? dateA.getTime() - dateB.getTime()
        : dateB.getTime() - dateA.getTime();
    }
    return 0;
  });
}

// Filter questions based on search term and course filter
export function filterQuestions(
  questions: any[],
  searchTerm: string,
  courseFilter: string
) {
  return questions.filter((question) => {
    // Make sure to search in title and text
    const matchesSearch = searchTerm
      ? question.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        question.text?.toLowerCase().includes(searchTerm.toLowerCase())
      : true;

    // Convert both to strings for comparison
    const questionCourseId = String(question.course_id);
    const filterCourseId = String(courseFilter);

    // Check if the course matches
    const matchesCourse =
      courseFilter === "all" || !courseFilter
        ? true
        : questionCourseId === filterCourseId;

    return matchesSearch && matchesCourse;
  });
}

// API functions
export async function fetchQuestions(
  callback: (data: any[]) => void,
  errorCallback: (err: any) => void
) {
  try {
    const currentUser = getCurrentUser();
    const response = await fetch(`${API_BASE_URL}/api/questions`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });

    if (response.status === 401) {
      errorCallback(new Error("Authentication required. Please log in again."));
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // For organization admins, they only see questions from their organization
    // This is now handled by the backend with organization filtering
    callback(data);
  } catch (err) {
    errorCallback(err);
  }
}

export async function fetchCourses(
  callback: (data: any[]) => void,
  errorCallback: (err: any) => void
) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/courses`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });

    if (response.status === 401) {
      errorCallback(new Error("Authentication required. Please log in again."));
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    callback(data);
  } catch (err) {
    errorCallback(err);
  }
}

export async function fetchKeywordPools(
  callback: (data: any[]) => void,
  errorCallback: (err: any) => void
) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/keyword-pools`, {
      cache: "no-store",
      headers: getAuthHeaders(),
    });

    if (response.status === 401) {
      errorCallback(new Error("Authentication required. Please log in again."));
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    callback(data);
  } catch (err) {
    errorCallback(err);
  }
}

export async function deleteQuestions(
  ids: number[],
  onSuccess: () => void,
  onError: (err: any) => void
) {
  try {
    console.log(
      `Sending delete request to ${API_BASE_URL}/api/questions/bulk-delete with IDs:`,
      ids
    );
    const res = await fetch(`${API_BASE_URL}/api/questions/bulk-delete`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ ids }),
      cache: "no-store",
    });

    if (res.status === 401) {
      onError(new Error("Authentication required. Please log in again."));
      return;
    }

    if (res.ok) {
      const result = await res.json();
      console.log("Delete response:", result);
      onSuccess();
    } else {
      console.error("Delete error status:", res.status);
      try {
        const error = await res.json();
        console.error("Delete error body:", error);
        onError(error);
      } catch (parseError) {
        console.error("Error parsing error response:", parseError);
        onError({ message: `Server error: ${res.status} ${res.statusText}` });
      }
    }
  } catch (err) {
    console.error("Delete exception:", err);
    onError(err);
  }
}

export async function updateQuestion(
  questionData: any,
  onSuccess: (data: any) => void,
  onError: (err: any) => void
) {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/questions/${questionData.id}`,
      {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(questionData),
      }
    );

    if (res.status === 401) {
      onError(new Error("Authentication required. Please log in again."));
      return;
    }

    if (res.ok) {
      const updated = await res.json();
      onSuccess(updated);
    } else {
      const error = await res.json();
      onError(error);
    }
  } catch (err) {
    onError(err);
  }
}

export async function addQuestion(
  questionData: any,
  onSuccess: (data: any) => void,
  onError: (err: any) => void
) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/questions`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(questionData),
    });

    if (res.status === 401) {
      onError(new Error("Authentication required. Please log in again."));
      return;
    }

    if (res.ok) {
      const newQuestion = await res.json();
      onSuccess(newQuestion);
    } else {
      const error = await res.json();
      onError(error);
    }
  } catch (err) {
    onError(err);
  }
}

export async function uploadImage(
  file: File,
  onSuccess: (url: string) => void,
  onError: (err: any) => void
) {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const token = localStorage.getItem("token");
    const headers: any = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    console.log(`[Upload] Starting upload for: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

    const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (uploadRes.status === 401) {
      onError(new Error("Authentication required. Please log in again."));
      return;
    }

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      if (data.url) {
        console.log(`[Upload] Successfully uploaded: ${file.name}`);
        onSuccess(data.url);
      } else {
        console.error("[Upload] No URL in response:", data);
        onError(new Error("Upload succeeded but no URL returned"));
      }
    } else {
      // Try to get error message from response
      let errorMessage = "Failed to upload image";
      try {
        const errorData = await uploadRes.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // If parsing JSON fails, use default message
      }
      console.error(`[Upload] Failed to upload ${file.name}:`, errorMessage);
      onError(new Error(errorMessage));
    }
  } catch (err) {
    console.error(`[Upload] Exception during upload of ${file.name}:`, err);
    onError(err);
  }
}

// Forensic science keywords for explanation validation
const FORENSIC_KEYWORDS = [
  "forensic",
  "evidence",
  "specimen",
  "analysis",
  "comparison",
  "examination",
  "microscopic",
  "chemical",
  "physical",
  "biological",
  "trace",
  "fiber",
  "hair",
  "blood",
  "fingerprint",
  "document",
  "ballistics",
  "toxicology",
  "pathology",
  "anthropology",
  "odontology",
  "entomology",
  "botany",
  "soil",
  "glass",
  "paint",
  "toolmark",
  "impression",
  "firearm",
  "explosive",
  "drug",
  "alcohol",
  "dna",
  "serology",
  "immunology",
  "chromatography",
  "spectroscopy",
  "microscopy",
  "photography",
  "reconstruction",
  "identification",
  "authentication",
  "verification",
  "authentic",
  "genuine",
  "counterfeit",
  "fake",
  "real",
  "original",
  "sample",
  "test",
  "procedure",
  "method",
  "technique",
  "protocol",
  "laboratory",
  "crime",
  "investigation",
  "detection",
  "identification",
];

/**
 * Check if an explanation is related to forensic science
 * @param explanation - The explanation text to check
 * @returns boolean - True if the explanation contains forensic science keywords
 */
export const isForensicScienceRelated = (explanation: string): boolean => {
  if (!explanation || explanation.trim().length === 0) {
    return false;
  }

  const lowerExplanation = explanation.toLowerCase();
  const words = lowerExplanation.split(/\s+/);

  // Check if any forensic keywords are present
  const hasForensicKeywords = FORENSIC_KEYWORDS.some((keyword) =>
    lowerExplanation.includes(keyword.toLowerCase())
  );

  // Additional checks for forensic-related content
  const hasTechnicalTerms = words.some(
    (word) =>
      word.length > 8 || // Long technical terms
      /[A-Z]{2,}/.test(word) || // Acronyms
      /\d+/.test(word) // Numbers (measurements, etc.)
  );

  // Check for forensic analysis patterns
  const hasAnalysisPatterns =
    /(compare|analyze|examine|identify|determine|conclude|observe|measure|test)/i.test(
      explanation
    );

  return hasForensicKeywords || (hasTechnicalTerms && hasAnalysisPatterns);
};

/**
 * Score an explanation based on forensic science relevance
 * @param explanation - The explanation text to score
 * @param conclusion - The selected conclusion (fake/real)
 * @returns object - Score details
 */
export const scoreExplanation = (explanation: string, conclusion: string) => {
  const isRelevant = isForensicScienceRelated(explanation);
  const hasConclusion = conclusion && conclusion.trim().length > 0;
  const hasExplanation = explanation && explanation.trim().length > 0;

  return {
    isRelevant,
    hasConclusion,
    hasExplanation,
    score: isRelevant && hasConclusion && hasExplanation ? 1 : 0,
    feedback: isRelevant
      ? "Explanation is relevant to forensic science."
      : "Explanation should be related to forensic science analysis.",
  };
};
