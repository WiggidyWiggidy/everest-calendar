// ============================================
// Root page — redirects to dashboard
// If not authenticated, middleware will redirect to /login
// ============================================
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
