import api from './api';
import type { PortalUser, UserRole } from '../types';

export const getUsers = async (): Promise<PortalUser[]> => {
  const response = await api.get('/users');
  return (response.data?.users ?? []) as PortalUser[];
};

export const createUser = async (payload: {
  username: string;
  password: string;
  role: UserRole;
  allowedPages: string[];
}): Promise<PortalUser> => {
  const response = await api.post('/users', payload);
  return response.data.user as PortalUser;
};

export const updateUser = async (
  id: string,
  payload: Partial<{
    username: string;
    password: string;
    role: UserRole;
    allowedPages: string[];
  }>
): Promise<PortalUser> => {
  const response = await api.put(`/users/${id}`, payload);
  return response.data.user as PortalUser;
};

export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};
