import React, { createContext, useContext, useEffect, useState } from "react";

interface AnimationContextType {
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  toggleAnimations: () => void;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  const [animationsEnabled, setAnimationsEnabledState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("animationsEnabled");
      if (stored !== null) return stored === "true";
    }
    return true; // Default animations on
  });

  const setAnimationsEnabled = (enabled: boolean) => {
    setAnimationsEnabledState(enabled);
    localStorage.setItem("animationsEnabled", String(enabled));
  };

  const toggleAnimations = () => {
    setAnimationsEnabled(!animationsEnabled);
  };

  // Add/remove a global class to body to force instant transitions for standard CSS
  useEffect(() => {
    if (animationsEnabled) {
      document.body.classList.remove("animations-off");
    } else {
      document.body.classList.add("animations-off");
    }
  }, [animationsEnabled]);

  return (
    <AnimationContext.Provider value={{ animationsEnabled, toggleAnimations, setAnimationsEnabled }}>
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimation() {
  const context = useContext(AnimationContext);
  if (context === undefined) {
    throw new Error("useAnimation must be used within an AnimationProvider");
  }
  return context;
}
