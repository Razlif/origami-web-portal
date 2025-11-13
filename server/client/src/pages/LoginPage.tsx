import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../store/useSession';

export const LoginPage = () => {
  const { login } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    const success = await login(username.trim(), password);
    if (success) {
      navigate('/dashboard');
      setError('');
    } else {
      setError('The username or password you entered is incorrect.');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="card w-full max-w-md space-y-6 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold text-strong">Origami Portal</h1>
          <p className="text-sm text-muted">Sign in to access your dashboards.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-muted" htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-full border border-soft bg-surface px-4 py-3 text-sm text-strong focus:border-primary focus:outline-none"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-muted" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-full border border-soft bg-surface px-4 py-3 text-sm text-strong focus:border-primary focus:outline-none"
              required
            />
          </div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
