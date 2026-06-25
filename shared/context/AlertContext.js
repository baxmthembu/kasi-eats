import React, { createContext, useContext, useState, useCallback } from 'react';
import AppAlert from '../components/AppAlert';

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const [config, setConfig] = useState(null);

  const showAlert = useCallback((title, message, buttons) => {
    setConfig({ title, message, buttons });
  }, []);

  const hideAlert = useCallback(() => setConfig(null), []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AppAlert
        visible={!!config}
        title={config?.title}
        message={config?.message}
        buttons={config?.buttons}
        onDismiss={hideAlert}
      />
    </AlertContext.Provider>
  );
}

export const useAppAlert = () => useContext(AlertContext);
