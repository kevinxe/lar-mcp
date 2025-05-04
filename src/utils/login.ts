import axios from 'axios';

interface LoginResponse {
  token: string;
  expiration: string;
}

interface UserIdResponse {
  userId: string;
}

export async function loginAPI(): Promise<string> {
  const apiUrl = process.env.API_URL;
  const email  = process.env.API_EMAIL;
  const pass   = process.env.API_PASSWORD;

  if (!apiUrl || !email || !pass) {
    throw new Error('Faltan las variables de entorno API_URL, API_EMAIL o API_PASSWORD');
  }

  const url = `${apiUrl}/api/auth/login`;
  const { data } = await axios.post<LoginResponse>(url, {
    email,
    password: pass
  });

  return data.token;
}

export async function getUserId(): Promise<string> {

  const token = await loginAPI();
  const apiUrl = process.env.API_URL;
  
  const url = `${apiUrl}/api/auth/user-id`;
  
  const { data } = await axios.get<UserIdResponse>(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  
  return data.userId;
}