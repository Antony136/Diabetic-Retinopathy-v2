import React, { createContext, useContext, useState } from "react";
import type { AdaptiveScreeningMode } from "../services/reports";

interface ScreeningModeContextType {
  adaptiveMode: AdaptiveScreeningMode;
  setAdaptiveMode: (mode: AdaptiveScreeningMode) => void;
}

const ScreeningModeContext = createContext<ScreeningModeContextType | undefined>(undefined);

export const ScreeningModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adaptiveMode, setAdaptiveModeState] = useState<AdaptiveScreeningMode>(() => {
    const saved = localStorage.getItem("screening_mode");
    return (saved as AdaptiveScreeningMode) || "standard";
  });

  const setAdaptiveMode = (mode: AdaptiveScreeningMode) => {
    setAdaptiveModeState(mode);
    localStorage.setItem("screening_mode", mode);
  };

  return (
    <ScreeningModeContext.Provider value={{ adaptiveMode, setAdaptiveMode }}>
      {children}
    </ScreeningModeContext.Provider>
  );
};

export const useScreeningMode = () => {
  const context = useContext(ScreeningModeContext);
  if (context === undefined) {
    throw new Error("useScreeningMode must be used within a ScreeningModeProvider");
  }
  return context;
};
