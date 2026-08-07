import { useEffect, useState } from 'react';
import { getSettings } from '../../api/client';
import { useAuth } from './useAuth';

export function useSettingsPermission(key: string, defaultAllowed = true) {
  const { isAdmin } = useAuth();
  const [allowed, setAllowed] = useState(isAdmin || defaultAllowed);

  useEffect(() => {
    if (isAdmin) {
      setAllowed(true);
      return;
    }
    getSettings()
      .then((s) => setAllowed((s as Record<string, string>)[key] !== 'false'))
      .catch(() => setAllowed(defaultAllowed));
  }, [isAdmin, key, defaultAllowed]);

  return allowed;
}
