import React, { createContext, useContext, ReactNode } from 'react';

interface AppContextType {
  // Placeholder for future global state
  // Can be extended with shared state as needed
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const value: AppContextType = {
    // Initialize global state here if needed
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
