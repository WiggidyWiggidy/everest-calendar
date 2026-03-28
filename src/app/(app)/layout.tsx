// ============================================
// App Layout (protected routes)
// Wraps all authenticated pages with the sidebar
// ============================================
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/layout/Sidebar';
import ConditionalVoiceCapture from '@/components/global/ConditionalVoiceCapture';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if user is authenticated on the server
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar userEmail={user.email || ''} />
      {/* Main content — offset by sidebar width on desktop */}
      <main className="lg:ml-64 min-h-screen">
        <div className="p-6 lg:p-8 pt-16 lg:pt-8 pb-8">
          {children}
        </div>
        {/* Command Centre — hidden on /inbox to avoid overlap */}
        <ConditionalVoiceCapture />
      </main>
    </div>
  );
}
