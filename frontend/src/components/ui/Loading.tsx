import React from "react";

interface LoadingProps {
  message?: string;
  className?: string;
  fullScreen?: boolean;
}

const Loading: React.FC<LoadingProps> = ({ message = "Loading...", className = "", fullScreen = false }) => {
  const wrapperClass = fullScreen ? "min-h-[40vh] flex items-center justify-center" : "w-full flex items-center justify-center py-6";
  const svgSize = fullScreen ? "h-12 w-12" : "h-8 w-8";

  return (
    <div className={`${wrapperClass} ${className}`}>
      <div className="inline-flex items-center space-x-4">
        <svg
          className={`${svgSize} text-primary animate-spin`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          ></path>
        </svg>

        <div className="flex flex-col items-start">
          <div className="text-sm font-medium text-foreground">{message}</div>
          <div className="flex items-center mt-1 space-x-1">
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.12s" }} />
            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0.24s" }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Loading;
