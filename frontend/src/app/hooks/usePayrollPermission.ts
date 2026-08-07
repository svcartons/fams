import { useEffect, useState } from 'react';
import { getSettings } from '../../api/client';
import { useAuth } from './useAuth';

export function usePayrollPermission() {
  const { isAdmin } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (isAdmin) {
      setAllowed(true);
      return;
    }
    getSettings()
      .then(s => setAllowed(s.perm_supervisor_salary_view !== 'false'))
      .catch(() => setAllowed(false));
  }, [isAdmin]);

  return allowed;
}
