import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { getAuthConfig } from '../../api/client';

export function Welcome() {
  const [siteName, setSiteName] = useState<string | null>(null);

  useEffect(() => {
    void getAuthConfig().then((config) => setSiteName(config.siteName)).catch(() => {});
  }, []);

  return (
    <main className="fams-welcome">
      <img className="fams-welcome-image" src="/images/factory-attendance-welcome.png" alt="Workers using an attendance terminal on a factory floor" />
      <div className="fams-welcome-shade" aria-hidden="true" />
      <div className="fams-welcome-content">
        <div className="fams-welcome-brand">
          <span className="fams-welcome-mark" aria-hidden="true">F</span>
          <span>FAMS</span>
        </div>
        <p className="fams-welcome-eyebrow">Factory Attendance Management</p>
        <h1>FAMS</h1>
        <p className="fams-welcome-copy">
          {siteName || 'Your factory operations site'}<br />
          Secure access for authorized attendance teams.
        </p>
        <Link to="/login" className="fams-welcome-cta">
          Open secure sign in <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      <div className="fams-welcome-status">
        <ShieldCheck aria-hidden="true" />
        <span>Authorized personnel only. Activity is audited.</span>
      </div>
    </main>
  );
}
