import { createContext, useContext, useState } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));

  const save = ({ token, ...profile }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(profile));
    setUser(profile);
  };

  const login = async (email, password) =>
    save((await api.post('/auth/login', { email, password })).data);

  const register = async (name, email, password) =>
    save((await api.post('/auth/register', { name, email, password })).data);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}