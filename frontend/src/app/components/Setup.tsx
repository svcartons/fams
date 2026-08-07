import { useState } from 'react';
import { useNavigate } from 'react-router';
import { setupAdmin } from '../../api/client';
import { toast } from 'sonner';
import { User, Lock, Key, Eye, EyeOff } from 'lucide-react';
import { AuthLayout, AuthField, AuthInput, AuthSubmit } from './layout/AuthLayout';

export function Setup() {
  const [formData, setFormData] = useState({ username: '', password: '', name: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password.length < 12) {
      toast.error('Password must be at least 12 characters');
      return;
    }
    setLoading(true);
    try {
      await setupAdmin(formData);
      toast.success('Admin account created! Please log in.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="System setup"
      subtitle="Create the primary administrator account. This screen is only available when no users exist."
    >
      <form onSubmit={handleSubmit}>
        <AuthField label="Admin name">
          <AuthInput
            icon={User}
            type="text"
            required
            placeholder="e.g. System Administrator"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
        </AuthField>
        <AuthField label="Username">
          <AuthInput
            icon={Key}
            type="text"
            required
            placeholder="admin"
            value={formData.username}
            onChange={e => setFormData({ ...formData, username: e.target.value })}
          />
        </AuthField>
        <AuthField label="Password">
          <AuthInput
            icon={Lock}
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="••••••••"
            value={formData.password}
            onChange={e => setFormData({ ...formData, password: e.target.value })}
            suffix={
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="fams-auth-input-action">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
        </AuthField>
        <AuthSubmit loading={loading}>Complete setup</AuthSubmit>
      </form>
      <p className="fams-settings-hint mt-4 text-center">
        Password must be at least 12 characters.
      </p>
    </AuthLayout>
  );
}
